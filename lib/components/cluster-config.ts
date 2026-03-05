import { TLSSecurityPolicy } from "aws-cdk-lib/aws-opensearchservice";
import { RemovalPolicy } from "aws-cdk-lib";

export enum ClusterType {
    OPENSEARCH_MANAGED_SERVICE = 'OPENSEARCH_MANAGED_SERVICE',
    OPENSEARCH_SERVERLESS = 'OPENSEARCH_SERVERLESS',
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
    /** Enable slow search log publishing */
    slowSearchLogEnabled?: boolean;
    /** CloudWatch Log Group ARN for slow search logs */
    slowSearchLogGroupARN?: string;
    /** Enable audit log publishing */
    auditLogEnabled?: boolean;
    /** CloudWatch Log Group ARN for audit logs */
    auditLogGroupARN?: string;
    nodeToNodeEncryptionEnabled?: boolean;
    openAccessPolicyEnabled?: boolean;
    accessPolicies?: object;
    coldStorageEnabled?: boolean;
    multiAZWithStandbyEnabled?: boolean;
    offPeakWindowEnabled?: boolean;
    /** SAML identity provider entity ID */
    samlEntityId?: string;
    /** SAML metadata XML content (inline or file path resolved by caller) */
    samlMetadataContent?: string;
    samlMasterUserName?: string;
    samlMasterBackendRole?: string;
    samlRolesKey?: string;
    samlSubjectKey?: string;
    samlSessionTimeoutMinutes?: number;
    /** Cognito User Pool ID for Dashboards authentication */
    cognitoUserPoolId?: string;
    /** Cognito Identity Pool ID for Dashboards authentication */
    cognitoIdentityPoolId?: string;
    /** IAM Role ARN for Cognito authentication */
    cognitoRoleArn?: string;
    /** Custom domain endpoint (e.g. search.example.com) */
    customEndpoint?: string;
    /** ACM certificate ARN for the custom endpoint */
    customEndpointCertificateArn?: string;
    /** Enable Auto-Tune for automatic performance optimization */
    autoTuneEnabled?: boolean;
    /** Allow all traffic from the VPC CIDR to the cluster */
    allowAllVpcTraffic?: boolean;
}

/** A single collection within a serverless collection group */
export interface CollectionEntry {
    collectionName: string;
    collectionType?: string;
}

/** Configuration for OpenSearch Serverless collections */
export interface ServerlessClusterConfig extends BaseClusterConfig {
    clusterType: 'OPENSEARCH_SERVERLESS';
    collectionType?: string;
    standbyReplicas?: string;
    /** VPC endpoint ID — when set, disables public access and restricts to this endpoint */
    vpcEndpointId?: string;
    /** Create an OpenSearch Serverless VPC endpoint (requires VPC) */
    createVpcEndpoint?: boolean;
    /** Multiple collections sharing encryption/network/data-access policies */
    collections?: CollectionEntry[];
    /** IAM principal ARNs for data access policy (default: account root) */
    dataAccessPrincipals?: string[];
    /** Source IP addresses for network policy restriction (CIDR notation) */
    sourceIPAddresses?: string[];
}

/** Discriminated union — use `config.clusterType` to narrow the type */
export type ClusterConfig = ManagedClusterConfig | ServerlessClusterConfig;
