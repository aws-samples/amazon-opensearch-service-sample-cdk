import {Construct} from "constructs";
import {Stack, StackProps} from "aws-cdk-lib";
import {createOpenSearchStack} from "./opensearch-domain-stack";
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

export interface StackPropsExt extends StackProps {
    readonly stage: string,
}

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

        if (!stage) {
            throw new Error(`Required CDK context field 'stage' is not present`)
        }
        if (stage.length > MAX_STAGE_NAME_LENGTH) {
            throw new Error(`Maximum allowed stage name length is ${MAX_STAGE_NAME_LENGTH} characters but received ${stage}`)
        }
        if (vpcAZCount && vpcId) {
            throw new Error("The 'vpcAZCount' option cannot be used with an imported VPC via 'vpcId'")
        }

        let networkStack: NetworkStack|undefined
        if (!vpcId) {
            networkStack = new NetworkStack(scope, `networkStack`, {
                vpcAZCount: vpcAZCount,
                stackName: `NetworkInfra-${stage}-${region}`,
                description: "This stack contains resources to create/manage VPC networking",
                stage: stage,
                env: props.env,
            })
            this.stacks.push(networkStack)
        }

        const clusters = getContextForType('clusters', 'object', defaultValues, contextJSON)
        if (!Array.isArray(clusters) || clusters.length === 0) {
            CdkLogger.warn("No clusters were defined in the CDK context. Skipping cluster stack creation.");
            return
        }
        for (const rawConfig of clusters) {
            const config = parseClusterConfig(rawConfig, defaultClusterValues, stage)
            const resolvedType = parseClusterType(config.clusterType, config.clusterId)
            const clusterVpcDetails = new VpcDetails(vpcId, networkStack?.vpc, config.clusterSubnetIds, networkStack?.defaultSecurityGroup)

            switch (resolvedType) {
                case ClusterType.OPENSEARCH_MANAGED_SERVICE: {
                    const stack = createOpenSearchStack(scope, config, clusterVpcDetails, stage, region, props.env)
                    this.stacks.push(stack);
                    break;
                }
            }
        }
    }
}
