import {Construct} from "constructs";
import {Stack, StackProps, Tags} from "aws-cdk-lib";
import {OpenSearchStack} from "./opensearch-stack";
import * as defaultValuesJson from "../default-values.json"
import * as defaultClusterValuesJson from "../default-cluster-values.json"
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
import {ManagedClusterConfig, ServerlessClusterConfig} from "./components/cluster-config";

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

        const managedClusters: ManagedClusterConfig[] = [];
        const serverlessClusters: ServerlessClusterConfig[] = [];

        for (const rawConfig of clusters) {
            const config = parseClusterConfig(rawConfig, defaultClusterValues, stage)
            const type = parseClusterType(config.clusterType, config.clusterId)
            switch (type) {
                case ClusterType.OPENSEARCH_MANAGED_SERVICE:
                    managedClusters.push(config as ManagedClusterConfig);
                    break;
                case ClusterType.OPENSEARCH_SERVERLESS:
                    serverlessClusters.push(config as ServerlessClusterConfig);
                    break;
            }
        }

        const stack = new OpenSearchStack(scope, 'openSearchStack', {
            stage,
            managedClusters,
            serverlessClusters,
            vpcId,
            vpcAZCount,
            vpcCidr,
            stackName: `OpenSearch-${stage}-${region}`,
            description: 'OpenSearch Service infrastructure — managed domains, serverless collections, and networking',
            env: props.env,
        });
        this.stacks.push(stack);

        // Apply tags
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
