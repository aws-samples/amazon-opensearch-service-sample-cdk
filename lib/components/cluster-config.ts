import { TLSSecurityPolicy } from "aws-cdk-lib/aws-opensearchservice";
import { RemovalPolicy } from "aws-cdk-lib";

/** Fields shared by all cluster types */
export interface BaseClusterConfig {
    clusterId: string;
    clusterType: string;
    clusterName: string;
    domainRemovalPolicy?: RemovalPolicy;
}

/** Configuration for managed OpenSearch Service domains */
export interface ManagedClusterConfig extends BaseClusterConfig {
    clusterType: 'OPENSEARCH_MANAGED_SERVICE';
    clusterVersion?: string;
    clusterSubnetIds?: string[];
    clusterSecurityGroupIds?: string[];
    dataNodeType?: string;
    dataNodeCount?: number;
    dedicatedManagerNodeType?: string;
    dedicatedManagerNodeCount?: number;
    warmNodeType?: string;
    warmNodeCount?: number;
    useUnsignedBasicAuth?: boolean;
    fineGrainedManagerUserARN?: string;
    fineGrainedManagerUserSecretARN?: string;
    enableDemoAdmin?: boolean;
    enforceHTTPS?: boolean;
    tlsSecurityPolicy?: TLSSecurityPolicy;
    ebsEnabled?: boolean;
    ebsIops?: number;
    ebsThroughput?: number;
    ebsVolumeSize?: number;
    ebsVolumeType?: string;
    encryptionAtRestEnabled?: boolean;
    encryptionAtRestKmsKeyARN?: string;
    loggingAppLogEnabled?: boolean;
    loggingAppLogGroupARN?: string;
    nodeToNodeEncryptionEnabled?: boolean;
    openAccessPolicyEnabled?: boolean;
    accessPolicies?: object;
}

/** Configuration for OpenSearch Serverless collections */
export interface ServerlessClusterConfig extends BaseClusterConfig {
    clusterType: 'OPENSEARCH_SERVERLESS';
    collectionType?: string;
    standbyReplicas?: string;
    /** VPC endpoint ID — when set, disables public access and restricts to this endpoint */
    vpcEndpointId?: string;
}

/** Discriminated union — use `config.clusterType` to narrow the type */
export type ClusterConfig = ManagedClusterConfig | ServerlessClusterConfig;
