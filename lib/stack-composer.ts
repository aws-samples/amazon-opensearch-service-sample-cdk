import {Construct} from "constructs";
import {Stack, StackProps, Tags} from "aws-cdk-lib";
import {OpenSearchDomainStack} from "./opensearch-domain-stack";
import {ServerlessCollectionStack} from "./serverless-collection-stack";
import * as defaultValuesJson from "../default-values.json"
import * as defaultClusterValuesJson from "../default-cluster-values.json"
import {NetworkStack} from "./network-stack";
import {
    MAX_STAGE_NAME_LENGTH,
    ClusterType,
    parseClusterType,
} from "./components/common-utilities";
import {
    getContextForType, parseClusterConfig,
    parseContextJson,
} from "./components/context-parsing"
import {CdkLogger} from "./components/cdk-logger";
import {VpcDetails} from "./components/vpc-details";
import {ClusterConfig, ManagedClusterConfig, ServerlessClusterConfig} from "./components/cluster-config";

export class StackComposer {
    public stacks: Stack[] = [];

    constructor(scope: Construct, props: StackProps) {

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const defaultValues: Record<string, any> = defaultValuesJson
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const defaultClusterValues: Record<string, any> = defaultClusterValuesJson
        if (!props.env?.region) {
            throw new Error('Missing at least one of required fields [region] in props.env. ' +
                'Has AWS been configured for this environment?');
        }
        const region = props.env.region

        const contextJSON = parseContextJson(scope)
        CdkLogger.info(`Using context options:\n---\n${JSON.stringify(contextJSON, null, 3)}\n---`);

        // General options
        const stage = getContextForType('stage', 'string', defaultValues, contextJSON)

        // VPC options
        const vpcId = getContextForType('vpcId', 'string', defaultValues, contextJSON)
        const vpcAZCount = getContextForType('vpcAZCount', 'number', defaultValues, contextJSON)
        const vpcCidr = getContextForType('vpcCidr', 'string', defaultValues, contextJSON)

        // Custom tags
        const customTags: Record<string, string> | undefined = getContextForType('tags', 'object', defaultValues, contextJSON)

        if (!stage) {
            throw new Error(`Required CDK context field 'stage' is not present`)
        }
        if (stage.length > MAX_STAGE_NAME_LENGTH) {
            throw new Error(`Maximum allowed stage name length is ${MAX_STAGE_NAME_LENGTH} characters but received ${stage}`)
        }
        if (vpcAZCount && vpcId) {
            throw new Error("The 'vpcAZCount' option cannot be used with an imported VPC via 'vpcId'")
        }
        if (vpcCidr && vpcId) {
            throw new Error("The 'vpcCidr' option cannot be used with an imported VPC via 'vpcId'")
        }

        // Parse clusters
        const clusters = getContextForType('clusters', 'object', defaultValues, contextJSON)
        if (!Array.isArray(clusters) || clusters.length === 0) {
            CdkLogger.warn("No clusters were defined in the CDK context. Skipping cluster stack creation.");
            return
        }

        const parsedClusters: { config: ClusterConfig; type: ClusterType }[] = clusters.map(rawConfig => {
            const config = parseClusterConfig(rawConfig, defaultClusterValues, stage)
            const type = parseClusterType(config.clusterType, config.clusterId)
            return { config, type }
        })

        // Smart VPC: only create NetworkStack if at least one managed cluster needs it and no vpcId is provided
        const hasManagedClusters = parsedClusters.some(c => c.type === ClusterType.OPENSEARCH_MANAGED_SERVICE)
        let networkStack: NetworkStack | undefined
        if (hasManagedClusters && !vpcId) {
            networkStack = new NetworkStack(scope, `networkStack`, {
                vpcAZCount: vpcAZCount,
                vpcCidr: vpcCidr,
                stackName: `NetworkInfra-${stage}-${region}`,
                description: "This stack contains resources to create/manage VPC networking",
                stage: stage,
                env: props.env,
            })
            this.stacks.push(networkStack)
        }

        for (const { config, type } of parsedClusters) {
            switch (type) {
                case ClusterType.OPENSEARCH_MANAGED_SERVICE: {
                    const managedConfig = config as ManagedClusterConfig;
                    const clusterStack = networkStack
                        ? new OpenSearchDomainStack(scope, `openSearchDomainStack-${config.clusterId}`, {
                            config: managedConfig,
                            vpcDetails: VpcDetails.fromCreatedVpc(networkStack.vpc, networkStack.clusterAccessSecurityGroup),
                            stage,
                            stackName: `OpenSearchDomain-${config.clusterId}-${stage}-${region}`,
                            description: 'This stack contains resources to create/manage an OpenSearch Service domain',
                            env: props.env,
                        })
                        : new OpenSearchDomainStack(scope, `openSearchDomainStack-${config.clusterId}`, {
                            config: managedConfig,
                            vpcId: vpcId as string,
                            stage,
                            stackName: `OpenSearchDomain-${config.clusterId}-${stage}-${region}`,
                            description: 'This stack contains resources to create/manage an OpenSearch Service domain',
                            env: props.env,
                        })
                    if (networkStack) {
                        clusterStack.addDependency(networkStack)
                    }
                    this.stacks.push(clusterStack)
                    break
                }
                case ClusterType.OPENSEARCH_SERVERLESS: {
                    const serverlessConfig = config as ServerlessClusterConfig;
                    const serverlessStack = new ServerlessCollectionStack(scope, `serverlessCollectionStack-${config.clusterId}`, {
                        config: serverlessConfig,
                        stage,
                        stackName: `OpenSearchServerless-${config.clusterId}-${stage}-${region}`,
                        description: 'This stack contains resources to create/manage an OpenSearch Serverless collection',
                        env: props.env,
                    })
                    this.stacks.push(serverlessStack)
                    break
                }
            }
        }

        // Apply tags to all stacks
        for (const stack of this.stacks) {
            Tags.of(stack).add('Environment', stage)
            Tags.of(stack).add('ManagedBy', 'CDK')
            Tags.of(stack).add('Project', 'opensearch-sample')
            if (customTags) {
                for (const [key, value] of Object.entries(customTags)) {
                    Tags.of(stack).add(key, value)
                }
            }
        }
    }
}
