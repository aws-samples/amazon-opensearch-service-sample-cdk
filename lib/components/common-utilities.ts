import {RemovalPolicy} from "aws-cdk-lib";
import {EngineVersion} from "aws-cdk-lib/aws-opensearchservice";

export const MAX_STAGE_NAME_LENGTH = 15;
export const MAX_CLUSTER_ID_LENGTH = 15;

/** AWS OpenSearch minimum name length for domains and AOSS collections. */
export const MIN_OPENSEARCH_NAME_LENGTH = 3;

/** AWS OpenSearch managed (AOS) domain name limit. @see https://docs.aws.amazon.com/opensearch-service/latest/developerguide/createupdatedomains.html */
export const MAX_AOS_DOMAIN_NAME_LENGTH = 28;

/** AWS OpenSearch Serverless (AOSS) collection name limit. @see https://docs.aws.amazon.com/opensearch-service/latest/ServerlessAPIReference/API_CreateCollection.html */
export const MAX_AOSS_COLLECTION_NAME_LENGTH = 32;

/** Effective `clusterName` limit for serverless clusters: 32-char AOSS policy-name cap minus the longest appended suffix (`-access`, 7 chars). */
export const MAX_AOSS_CLUSTER_NAME_LENGTH = 25;

export const LATEST_AOS_VERSION = "OS_2.19"

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

/** @deprecated Use ClusterType from cluster-config instead */
export { ClusterType, parseClusterType } from "./cluster-config";
