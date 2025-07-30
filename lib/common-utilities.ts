import {RemovalPolicy} from "aws-cdk-lib";
import {EngineVersion} from "aws-cdk-lib/aws-opensearchservice";

export const MAX_STAGE_NAME_LENGTH = 15;
export const MAX_CLUSTER_ID_LENGTH = 15;
export const LATEST_AOS_VERSION = "OS_2.19"

export enum ClusterType {
    OPENSEARCH_MANAGED_SERVICE = 'OPENSEARCH_MANAGED_SERVICE',
}


export function getEngineVersion(engineVersionString: string) : EngineVersion {
    let version: EngineVersion
    if (engineVersionString?.startsWith("OS_")) {
        // Will accept a period delimited version string (i.e. 1.3) and return a proper EngineVersion
        version = EngineVersion.openSearch(engineVersionString.substring(3))
    } else if (engineVersionString?.startsWith("ES_")) {
        version = EngineVersion.elasticsearch(engineVersionString.substring(3))
    } else {
        throw new Error(`Engine version (${engineVersionString}) is not present or does not match the expected format, i.e. OS_1.3 or ES_7.9`)
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