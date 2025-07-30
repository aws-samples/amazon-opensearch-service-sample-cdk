import {Construct} from "constructs";
import {Stack, StackProps} from "aws-cdk-lib";
import {OpenSearchDomainStack} from "./opensearch-domain-stack";
import {TLSSecurityPolicy} from "aws-cdk-lib/aws-opensearchservice";
import * as defaultValuesJson from "../default-values.json"
import {NetworkStack} from "./network-stack";
import {
    MAX_STAGE_NAME_LENGTH,
    MAX_CLUSTER_ID_LENGTH,
    parseRemovalPolicy, getEngineVersion, LATEST_AOS_VERSION,
} from "./common-utilities";
import {
    getContextForType, 
    parseContextJson,
} from "./context-parsing"
import {CdkLogger} from "./cdk-logger";

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

        // Cluster Options
        const clusterId = getContextForType('clusterId', 'string', defaultValues, contextJSON)
        const clusterName = getContextForType('clusterName', 'string', defaultValues, contextJSON)
        const clusterVersion = getContextForType('clusterVersion', 'string', defaultValues, contextJSON)
        const clusterType = getContextForType('clusterType', 'string', defaultValues, contextJSON)

        // OpenSearch Domain Options
        const dataNodeType = getContextForType('dataNodeType', 'string', defaultValues, contextJSON)
        const dataNodeCount = getContextForType('dataNodeCount', 'number', defaultValues, contextJSON)
        const dedicatedManagerNodeType = getContextForType('dedicatedManagerNodeType', 'string', defaultValues, contextJSON)
        const dedicatedManagerNodeCount = getContextForType('dedicatedManagerNodeCount', 'number', defaultValues, contextJSON)
        const warmNodeType = getContextForType('warmNodeType', 'string', defaultValues, contextJSON)
        const warmNodeCount = getContextForType('warmNodeCount', 'number', defaultValues, contextJSON)
        const useUnsignedBasicAuth = getContextForType('useUnsignedBasicAuth', 'boolean', defaultValues, contextJSON)
        const fineGrainedManagerUserARN = getContextForType('fineGrainedManagerUserARN', 'string', defaultValues, contextJSON)
        const fineGrainedManagerUserSecretARN = getContextForType('fineGrainedManagerUserSecretARN', 'string', defaultValues, contextJSON)
        const enableDemoAdmin = getContextForType('enableDemoAdmin', 'boolean', defaultValues, contextJSON)
        const enforceHTTPS = getContextForType('enforceHTTPS', 'boolean', defaultValues, contextJSON)
        const ebsEnabled = getContextForType('ebsEnabled', 'boolean', defaultValues, contextJSON)
        const ebsIops = getContextForType('ebsIops', 'number', defaultValues, contextJSON)
        const ebsVolumeTypeName = getContextForType('ebsVolumeType', 'string', defaultValues, contextJSON)
        const ebsVolumeSize = getContextForType('ebsVolumeSize', 'number', defaultValues, contextJSON)
        const encryptionAtRestEnabled = getContextForType('encryptionAtRestEnabled', 'boolean', defaultValues, contextJSON)
        const encryptionAtRestKmsKeyARN = getContextForType("encryptionAtRestKmsKeyARN", 'string', defaultValues, contextJSON)
        const loggingAppLogEnabled = getContextForType('loggingAppLogEnabled', 'boolean', defaultValues, contextJSON)
        const loggingAppLogGroupARN = getContextForType('loggingAppLogGroupARN', 'string', defaultValues, contextJSON)
        const noneToNodeEncryptionEnabled = getContextForType('nodeToNodeEncryptionEnabled', 'boolean', defaultValues, contextJSON)
        const vpcSecurityGroupIds = getContextForType('vpcSecurityGroupIds', 'object', defaultValues, contextJSON)
        const vpcSubnetIds = getContextForType('vpcSubnetIds', 'object', defaultValues, contextJSON)
        const openAccessPolicyEnabled = getContextForType('openAccessPolicyEnabled', 'boolean', defaultValues, contextJSON)
        const accessPolicyJson = getContextForType('accessPolicies', 'object', defaultValues, contextJSON)
        const domainRemovalPolicyName = getContextForType('domainRemovalPolicy', 'string', defaultValues, contextJSON)
        const tlsSecurityPolicyName = getContextForType('tlsSecurityPolicy', 'string', defaultValues, contextJSON)


        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // TODO move this to cluster block
        const requiredFields: Record<string, any> = {"stage":stage, "clusterId": clusterId, "clusterType": clusterType}
        for (const key in requiredFields) {
            if (!requiredFields[key]) {
                throw new Error(`Required CDK context field ${key} is not present`)
            }
        }

        if (stage.length > MAX_STAGE_NAME_LENGTH) {
            throw new Error(`Maximum allowed stage name length is ${MAX_STAGE_NAME_LENGTH} characters but received ${stage}`)
        }
        if (clusterId.length > MAX_CLUSTER_ID_LENGTH ) {
            throw new Error(`Maximum allowed cluster id length is ${MAX_CLUSTER_ID_LENGTH} characters but received ${clusterId}`)
        }


        const resolvedClusterName = clusterName ?? `cluster-${stage}-${clusterId}`
        // TODO get cluster type parsed
        const engineVersionValue = clusterVersion ? getEngineVersion(clusterVersion) : getEngineVersion(LATEST_AOS_VERSION)
        const domainRemovalPolicy = parseRemovalPolicy("domainRemovalPolicy", domainRemovalPolicyName)
        const tlsSecurityPolicy: TLSSecurityPolicy|undefined = tlsSecurityPolicyName ? TLSSecurityPolicy[tlsSecurityPolicyName as keyof typeof TLSSecurityPolicy] : undefined
        if (tlsSecurityPolicyName && !tlsSecurityPolicy) {
            throw new Error("Provided tlsSecurityPolicy does not match a selectable option, for reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_opensearchservice.TLSSecurityPolicy.html")
        }

        let networkStack: NetworkStack
        networkStack = new NetworkStack(scope, `networkStack`, {
            vpcId: vpcId,
            vpcSubnetIds: vpcSubnetIds,
            vpcAZCount: vpcAZCount,
            stackName: `NetworkInfra-${stage}-${region}`,
            description: "This stack contains resources to create/manage VPC networking",
            stage: stage,
            env: props.env,
        })
        this.stacks.push(networkStack)

        let openSearchStack
        openSearchStack = new OpenSearchDomainStack(scope, `openSearchDomainStack`, {
            version: engineVersionValue,
            domainName: resolvedClusterName,
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
            vpcDetails: networkStack ? networkStack.vpcDetails : undefined,
            vpcSecurityGroupIds: vpcSecurityGroupIds,
            domainRemovalPolicy: domainRemovalPolicy,
            stackName: `OpenSearchDomain-${stage}-${region}`,
            description: "This stack contains resources to create/manage an OpenSearch Service domain",
            stage: stage,
            env: props.env
        });
        this.stacks.push(openSearchStack)
    }
}
