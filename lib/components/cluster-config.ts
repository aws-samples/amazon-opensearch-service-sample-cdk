import { TLSSecurityPolicy } from "aws-cdk-lib/aws-opensearchservice";
import {RemovalPolicy} from "aws-cdk-lib";

export interface ClusterConfig {
    // General cluster options
    clusterId: string;
    clusterType: string;
    clusterName: string;
    clusterVersion?: string;
    clusterSubnetIds?: string[];
    clusterSecurityGroupIds?: string[];

    // OpenSearch-specific options
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
    ebsVolumeSize?: number;
    ebsVolumeType?: string;
    encryptionAtRestEnabled?: boolean;
    encryptionAtRestKmsKeyARN?: string;
    loggingAppLogEnabled?: boolean;
    loggingAppLogGroupARN?: string;
    nodeToNodeEncryptionEnabled?: boolean;
    openAccessPolicyEnabled?: boolean;
    accessPolicies?: object;
    domainRemovalPolicy?: RemovalPolicy;
}
