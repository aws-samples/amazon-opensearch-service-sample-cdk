import {Construct} from "constructs";
import {Stack, StackProps} from "aws-cdk-lib";
import {OpenSearchDomainStack} from "./opensearch-domain-stack";
import {TLSSecurityPolicy} from "aws-cdk-lib/aws-opensearchservice";
import * as defaultValuesJson from "../default-values.json"
import * as defaultClusterValuesJson from "../default-cluster-values.json"
import {NetworkStack} from "./network-stack";
import {
    MAX_STAGE_NAME_LENGTH,
    MAX_CLUSTER_ID_LENGTH,
    LATEST_AOS_VERSION,
    ClusterType,
    parseClusterType,
    parseRemovalPolicy,
    getEngineVersion,
} from "./common-utilities";
import {
    getContextForType, 
    parseContextJson,
} from "./context-parsing"
import {CdkLogger} from "./cdk-logger";
import {VpcDetails} from "./vpc-details";

export interface StackPropsExt extends StackProps {
    readonly stage: string,
}

export class StackComposer {
    public stacks: Stack[] = [];

    constructor(scope: Construct, props: StackProps) {

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const defaultValues: Record<string, any> = defaultValuesJson
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requiredFields: Record<string, any> = {"stage":stage}
        for (const key in requiredFields) {
            if (!requiredFields[key]) {
                throw new Error(`Required CDK context field ${key} is not present`)
            }
        }

        if (stage.length > MAX_STAGE_NAME_LENGTH) {
            throw new Error(`Maximum allowed stage name length is ${MAX_STAGE_NAME_LENGTH} characters but received ${stage}`)
        }
        if (vpcAZCount && vpcId) {
            throw new Error("The 'vpcAzCount' option cannot be used with an imported VPC via 'vpcId'")
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
        if (!clusters) {
            CdkLogger.warn("No clusters were defined in the CDK context. Skipping cluster stack creation.");
            return
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const defaultClusterValues: Record<string, any> = defaultClusterValuesJson
        for (const clusterConfig of clusters) {
            // Cluster Options
            const clusterId = getContextForType('clusterId', 'string', defaultClusterValues, clusterConfig)
            const clusterName = getContextForType('clusterName', 'string', defaultClusterValues, clusterConfig)
            const clusterVersion = getContextForType('clusterVersion', 'string', defaultClusterValues, clusterConfig)
            const clusterType = getContextForType('clusterType', 'string', defaultClusterValues, clusterConfig)
            const clusterSubnetIds = getContextForType('clusterSubnetIds', 'object', defaultClusterValues, contextJSON)

            // OpenSearch Domain Options
            const dataNodeType = getContextForType('dataNodeType', 'string', defaultClusterValues, clusterConfig)
            const dataNodeCount = getContextForType('dataNodeCount', 'number', defaultClusterValues, clusterConfig)
            const dedicatedManagerNodeType = getContextForType('dedicatedManagerNodeType', 'string', defaultClusterValues, clusterConfig)
            const dedicatedManagerNodeCount = getContextForType('dedicatedManagerNodeCount', 'number', defaultClusterValues, clusterConfig)
            const warmNodeType = getContextForType('warmNodeType', 'string', defaultClusterValues, clusterConfig)
            const warmNodeCount = getContextForType('warmNodeCount', 'number', defaultClusterValues, clusterConfig)
            const useUnsignedBasicAuth = getContextForType('useUnsignedBasicAuth', 'boolean', defaultClusterValues, clusterConfig)
            const fineGrainedManagerUserARN = getContextForType('fineGrainedManagerUserARN', 'string', defaultClusterValues, clusterConfig)
            const fineGrainedManagerUserSecretARN = getContextForType('fineGrainedManagerUserSecretARN', 'string', defaultClusterValues, clusterConfig)
            const enableDemoAdmin = getContextForType('enableDemoAdmin', 'boolean', defaultClusterValues, clusterConfig)
            const enforceHTTPS = getContextForType('enforceHTTPS', 'boolean', defaultClusterValues, clusterConfig)
            const ebsEnabled = getContextForType('ebsEnabled', 'boolean', defaultClusterValues, clusterConfig)
            const ebsIops = getContextForType('ebsIops', 'number', defaultClusterValues, clusterConfig)
            const ebsVolumeTypeName = getContextForType('ebsVolumeType', 'string', defaultClusterValues, clusterConfig)
            const ebsVolumeSize = getContextForType('ebsVolumeSize', 'number', defaultClusterValues, clusterConfig)
            const encryptionAtRestEnabled = getContextForType('encryptionAtRestEnabled', 'boolean', defaultClusterValues, clusterConfig)
            const encryptionAtRestKmsKeyARN = getContextForType("encryptionAtRestKmsKeyARN", 'string', defaultClusterValues, clusterConfig)
            const loggingAppLogEnabled = getContextForType('loggingAppLogEnabled', 'boolean', defaultClusterValues, clusterConfig)
            const loggingAppLogGroupARN = getContextForType('loggingAppLogGroupARN', 'string', defaultClusterValues, clusterConfig)
            const noneToNodeEncryptionEnabled = getContextForType('nodeToNodeEncryptionEnabled', 'boolean', defaultClusterValues, clusterConfig)
            const vpcSecurityGroupIds = getContextForType('vpcSecurityGroupIds', 'object', defaultClusterValues, clusterConfig)
            const openAccessPolicyEnabled = getContextForType('openAccessPolicyEnabled', 'boolean', defaultClusterValues, clusterConfig)
            const accessPolicyJson = getContextForType('accessPolicies', 'object', defaultClusterValues, clusterConfig)
            const domainRemovalPolicyName = getContextForType('domainRemovalPolicy', 'string', defaultClusterValues, clusterConfig)
            const tlsSecurityPolicyName = getContextForType('tlsSecurityPolicy', 'string', defaultClusterValues, clusterConfig)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const requiredClusterFields: Record<string, any> = {"clusterId": clusterId, "clusterType": clusterType}
            for (const key in requiredClusterFields) {
                if (!requiredClusterFields[key]) {
                    throw new Error(`Required CDK context field ${key} is not present in cluster object`)
                }
            }

            if (clusterId.length > MAX_CLUSTER_ID_LENGTH ) {
                throw new Error(`Maximum allowed cluster id length is ${MAX_CLUSTER_ID_LENGTH} characters but received ${clusterId}`)
            }

            const resolvedClusterName = clusterName ?? `cluster-${stage}-${clusterId}`
            const resolvedClusterType = parseClusterType(clusterType, clusterId)
            const engineVersionValue = clusterVersion ? getEngineVersion(clusterVersion) : getEngineVersion(LATEST_AOS_VERSION)
            const domainRemovalPolicy = parseRemovalPolicy("domainRemovalPolicy", domainRemovalPolicyName)
            const tlsSecurityPolicy: TLSSecurityPolicy|undefined = tlsSecurityPolicyName ? TLSSecurityPolicy[tlsSecurityPolicyName as keyof typeof TLSSecurityPolicy] : undefined
            if (tlsSecurityPolicyName && !tlsSecurityPolicy) {
                throw new Error("Provided tlsSecurityPolicy does not match a selectable option, for reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_opensearchservice.TLSSecurityPolicy.html")
            }

            const clusterVpcDetails = new VpcDetails(vpcId, networkStack?.vpc, clusterSubnetIds, networkStack?.defaultSecurityGroup)
            
            if (resolvedClusterType == ClusterType.OPENSEARCH_MANAGED_SERVICE) {
                const openSearchStack = new OpenSearchDomainStack(scope, `openSearchDomainStack`, {
                    version: engineVersionValue,
                    domainName: resolvedClusterName,
                    clusterId: clusterId,
                    dataNodeInstanceType: dataNodeType,
                    dataNodes: dataNodeCount,
                    dedicatedManagerNodeType: dedicatedManagerNodeType,
                    dedicatedManagerNodeCount: dedicatedManagerNodeCount,
                    warmInstanceType: warmNodeType,
                    warmNodes: warmNodeCount,
                    accessPolicyJson: accessPolicyJson,
                    openAccessPolicyEnabled: openAccessPolicyEnabled,
                    useUnsignedBasicAuth: useUnsignedBasicAuth,
                    fineGrainedManagerUserARN: fineGrainedManagerUserARN,
                    fineGrainedManagerUserSecretARN: fineGrainedManagerUserSecretARN,
                    enableDemoAdmin: enableDemoAdmin,
                    enforceHTTPS: enforceHTTPS,
                    tlsSecurityPolicy: tlsSecurityPolicy,
                    ebsEnabled: ebsEnabled,
                    ebsIops: ebsIops,
                    ebsVolumeSize: ebsVolumeSize,
                    ebsVolumeTypeName: ebsVolumeTypeName,
                    encryptionAtRestEnabled: encryptionAtRestEnabled,
                    encryptionAtRestKmsKeyARN: encryptionAtRestKmsKeyARN,
                    appLogEnabled: loggingAppLogEnabled,
                    appLogGroup: loggingAppLogGroupARN,
                    nodeToNodeEncryptionEnabled: noneToNodeEncryptionEnabled,
                    vpcDetails: clusterVpcDetails,
                    vpcSecurityGroupIds: vpcSecurityGroupIds,
                    domainRemovalPolicy: domainRemovalPolicy,
                    stackName: `OpenSearchDomain-${clusterId}-${stage}-${region}`,
                    description: "This stack contains resources to create/manage an OpenSearch Service domain",
                    stage: stage,
                    env: props.env
                });
                this.stacks.push(openSearchStack)
            }
            
        }
        
    }
}
