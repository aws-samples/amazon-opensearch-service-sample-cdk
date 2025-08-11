import {CfnOutput, RemovalPolicy, SecretValue} from "aws-cdk-lib";
import {EngineVersion} from "aws-cdk-lib/aws-opensearchservice";
import {Secret} from "aws-cdk-lib/aws-secretsmanager";
import {CdkLogger} from "./cdk-logger";
import {Construct} from "constructs";

export const MAX_STAGE_NAME_LENGTH = 15;
export const MAX_CLUSTER_ID_LENGTH = 15;
export const LATEST_AOS_VERSION = "OS_2.19"

export enum ClusterType {
    OPENSEARCH_MANAGED_SERVICE = 'OPENSEARCH_MANAGED_SERVICE',
}

export function parseClusterType(input: string, clusterId: string): ClusterType {
    if (!input) {
        throw new Error(`The 'clusterType' option must be provided for the '${clusterId}' cluster configuration. The available options are [${Object.values(ClusterType)}]`);
    }
    if (Object.values(ClusterType).includes(input as ClusterType)) {
        return input as ClusterType;
    }
    throw new Error(`Invalid 'clusterType' provided in '${clusterId}' cluster configuration: ${input}. The available options are ${Object.values(ClusterType)}`);
}

export function getEngineVersion(engineVersionString: string) : EngineVersion {
    let version: EngineVersion
    if (engineVersionString?.startsWith("OS_")) {
        // Will accept a period delimited version string (i.e. 1.3) and return a proper EngineVersion
        version = EngineVersion.openSearch(engineVersionString.substring(3))
    } else if (engineVersionString?.startsWith("ES_")) {
        version = EngineVersion.elasticsearch(engineVersionString.substring(3))
    } else {
        throw new Error(`Engine version (${engineVersionString}) is not present or does not match the expected format, e.g. OS_1.3 or ES_7.9`)
    }
    return version
}

export function parseRemovalPolicy(optionName: string, policyNameString?: string): RemovalPolicy|undefined {
    const policy = policyNameString ? RemovalPolicy[policyNameString as keyof typeof RemovalPolicy] : undefined
    if (policyNameString && !policy) {
        throw new Error(`Provided '${optionName}' with value '${policyNameString}' does not match a selectable option, for reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.RemovalPolicy.html`)
    }
    return policy
}

export function createBasicAuthSecret(scope: Construct, username: string, password: string, stage: string, clusterId: string): Secret {
    CdkLogger.warn(`Password passed in plain text for ${clusterId} cluster, this is insecure and will leave your password exposed.`)
    return new Secret(scope, `${clusterId}ClusterBasicAuthSecret`, {
        secretName: `${clusterId}-cluster-basic-auth-secret-${stage}`,
        secretObjectValue: {
            username: SecretValue.unsafePlainText(username),
            password: SecretValue.unsafePlainText(password)
        }
    })
}

export function generateClusterExports(scope: Construct, clusterEndpoint: string, clusterId: string, stage: string, clusterAccessSecurityGroupId?: string) {
    new CfnOutput(scope, `ClusterEndpointExport-${stage}-${clusterId}`, {
        exportName: `ClusterEndpoint-${stage}-${clusterId}`,
        value: clusterEndpoint,
        description: 'The endpoint URL of the cluster',
    });
    if (clusterAccessSecurityGroupId) {
        new CfnOutput(scope, `ClusterAccessSecurityGroupIdExport-${stage}-${clusterId}`, {
            exportName: `ClusterAccessSecurityGroupId-${stage}-${clusterId}`,
            value: clusterAccessSecurityGroupId,
            description: 'The cluster access security group id',
        });
    }
}