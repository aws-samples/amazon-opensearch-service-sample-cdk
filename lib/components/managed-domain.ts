import {CfnOutput, SecretValue, Stack} from "aws-cdk-lib";
import {
    EbsDeviceVolumeType,
    ISecurityGroup,
    SecurityGroup, SubnetSelection,
} from "aws-cdk-lib/aws-ec2";
import {Domain, SAMLOptionsProperty, ZoneAwarenessConfig} from "aws-cdk-lib/aws-opensearchservice";
import {IKey, Key} from "aws-cdk-lib/aws-kms";
import {ILogGroup, LogGroup} from "aws-cdk-lib/aws-logs";
import {ISecret, Secret} from "aws-cdk-lib/aws-secretsmanager";
import {CfnDomain} from "aws-cdk-lib/aws-opensearchservice";
import {NagSuppressions} from "cdk-nag";
import {VpcDetails} from "./vpc-details";
import {getEngineVersion, LATEST_AOS_VERSION, MAX_AOS_DOMAIN_NAME_LENGTH, MIN_OPENSEARCH_NAME_LENGTH} from "./common-utilities";
import {ManagedClusterConfig} from "./cluster-config";

/**
 * Creates a managed OpenSearch domain within the given stack.
 * This is a helper function, not a separate stack — all resources
 * are created in the caller's stack scope.
 *
 * Access policies are written directly to `CfnDomain.AccessPolicies` rather
 * than passed to the L2 `Domain` construct. The L2 construct synthesizes
 * `accessPolicies` through a Lambda-backed `Custom::OpenSearchAccessPolicy`
 * resource that calls `es:UpdateDomainConfig` after the domain is created;
 * that path is sensitive to IAM eventual consistency on the per-domain inline
 * policy that grants the custom-resource Lambda its API permission, and has
 * been observed to produce `AccessDenied: es:UpdateDomainConfig` at deploy
 * time. CFN natively supports inline access policies on
 * `AWS::OpenSearchService::Domain.AccessPolicies`, so we bake the policy into
 * the `CreateDomain` call itself — no Lambda, no second-step UpdateDomainConfig,
 * no IAM propagation race possible.
 */
export function createManagedDomain(stack: Stack, config: ManagedClusterConfig, stage: string, vpcDetails?: VpcDetails): void {
    const prefix = config.clusterId;

    // Skip for first synthesis stage (dummy VPC from lookup)
    if (vpcDetails?.vpc.vpcId === "vpc-12345") {
        return;
    }

    if (config.publicAccess && config.openAccessPolicyEnabled) {
        throw new Error(
            `Cluster '${prefix}': 'publicAccess' and 'openAccessPolicyEnabled' cannot both be true. ` +
            `Public domains require a restrictive access policy (e.g. account-scoped SigV4). ` +
            `Use 'accessPolicies' with a scoped principal instead of 'openAccessPolicyEnabled'.`
        );
    }

    const version = config.clusterVersion
        ? getEngineVersion(config.clusterVersion)
        : getEngineVersion(LATEST_AOS_VERSION);

    const earKmsKey: IKey | undefined = config.encryptionAtRestKmsKeyARN && config.encryptionAtRestEnabled
        ? Key.fromKeyArn(stack, `${prefix}-earKey`, config.encryptionAtRestKmsKeyARN) : undefined;

    const appLG: ILogGroup | undefined = config.loggingAppLogGroupARN && config.loggingAppLogEnabled
        ? LogGroup.fromLogGroupArn(stack, `${prefix}-appLogGroup`, config.loggingAppLogGroupARN) : undefined;

    const slowSearchLG: ILogGroup | undefined = config.slowSearchLogGroupARN && config.slowSearchLogEnabled
        ? LogGroup.fromLogGroupArn(stack, `${prefix}-slowSearchLogGroup`, config.slowSearchLogGroupARN) : undefined;

    const auditLG: ILogGroup | undefined = config.auditLogGroupARN && config.auditLogEnabled
        ? LogGroup.fromLogGroupArn(stack, `${prefix}-auditLogGroup`, config.auditLogGroupARN) : undefined;

    let adminUserSecret: ISecret | undefined = config.fineGrainedManagerUserSecretARN
        ? Secret.fromSecretCompleteArn(stack, `${prefix}-managerSecret`, config.fineGrainedManagerUserSecretARN) : undefined;
    if (config.enableDemoAdmin) {
        adminUserSecret = new Secret(stack, `${prefix}ClusterBasicAuthSecret`, {
            secretName: `${prefix}-cluster-basic-auth-secret-${stage}`,
            secretObjectValue: {
                username: SecretValue.unsafePlainText("admin"),
                password: SecretValue.unsafePlainText("myStrongPassword123!"),
            },
        });
    }

    let zoneAwarenessConfig: ZoneAwarenessConfig | undefined;
    let domainSubnets: SubnetSelection[] | undefined;
    let numAZs: number | undefined;
    const securityGroups: ISecurityGroup[] = [];

    if (vpcDetails) {
        const numSubnets = vpcDetails.subnetSelection.subnets;
        if (!numSubnets || numSubnets.length < 1) {
            throw new Error("Internal error: There should always be at least 1 subnet in the VpcDetails subnet selection");
        }
        numAZs = numSubnets.length;
        validateNodeCounts(numAZs, config);
        zoneAwarenessConfig = numAZs > 1
            ? {enabled: true, availabilityZoneCount: numAZs} : undefined;
        domainSubnets = [vpcDetails.subnetSelection];
        if (vpcDetails.clusterAccessSecurityGroup) {
            securityGroups.push(vpcDetails.clusterAccessSecurityGroup);
        }
    }

    if (config.clusterSecurityGroupIds) {
        for (let i = 0; i < config.clusterSecurityGroupIds.length; i++) {
            securityGroups.push(SecurityGroup.fromLookupById(stack, `${prefix}-domainSecurityGroup-${i}`, config.clusterSecurityGroupIds[i]));
        }
    }

    const ebsVolumeType = config.ebsVolumeType ? getEbsVolumeType(config.ebsVolumeType) : undefined;
    const supportsIops = ebsVolumeType === EbsDeviceVolumeType.GP3
        || ebsVolumeType === EbsDeviceVolumeType.IO1
        || ebsVolumeType === EbsDeviceVolumeType.IO2;
    const supportsThroughput = ebsVolumeType === EbsDeviceVolumeType.GP3;

    let accessPolicyDoc: Record<string, unknown> | undefined;
    if (config.openAccessPolicyEnabled) {
        accessPolicyDoc = {
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Principal: {AWS: "*"},
                Action: "es:*",
                Resource: `arn:${stack.partition}:es:${stack.region}:${stack.account}:domain/${config.clusterName}/*`,
            }],
        };
    } else if (config.accessPolicies) {
        accessPolicyDoc = validateAccessPolicies(config.accessPolicies, config.clusterId);
    }

    // SAML authentication
    let samlAuthenticationOptions: SAMLOptionsProperty | undefined;
    if (config.samlEntityId && config.samlMetadataContent) {
        samlAuthenticationOptions = {
            idpEntityId: config.samlEntityId,
            idpMetadataContent: config.samlMetadataContent,
            masterUserName: config.samlMasterUserName,
            masterBackendRole: config.samlMasterBackendRole,
            rolesKey: config.samlRolesKey,
            subjectKey: config.samlSubjectKey,
            sessionTimeoutMinutes: config.samlSessionTimeoutMinutes,
        };
    }

    // Fail fast: CFN rejects domain names outside 3-28 chars with a generic InvalidParameter error.
    if (config.clusterName.length < MIN_OPENSEARCH_NAME_LENGTH) {
        throw new Error(
            `Cluster '${config.clusterId}': AOS domain name '${config.clusterName}' is ${config.clusterName.length} characters, ` +
            `below the AWS minimum of ${MIN_OPENSEARCH_NAME_LENGTH}. Set 'clusterName' to at least ${MIN_OPENSEARCH_NAME_LENGTH} characters.`
        );
    }
    if (config.clusterName.length > MAX_AOS_DOMAIN_NAME_LENGTH) {
        throw new Error(
            `Cluster '${config.clusterId}': AOS domain name '${config.clusterName}' is ${config.clusterName.length} characters, ` +
            `exceeding the AWS limit of ${MAX_AOS_DOMAIN_NAME_LENGTH}. Set a shorter 'clusterName' or reduce 'stage'.`
        );
    }

    const domain = new Domain(stack, `${prefix}-Domain`, {
        version,
        domainName: config.clusterName,
        useUnsignedBasicAuth: config.useUnsignedBasicAuth,
        capacity: {
            dataNodeInstanceType: config.dataNodeType,
            dataNodes: config.dataNodeCount ?? numAZs,
            masterNodeInstanceType: config.dedicatedManagerNodeType,
            masterNodes: config.dedicatedManagerNodeCount,
            warmInstanceType: config.warmNodeType,
            warmNodes: config.warmNodeCount,
            multiAzWithStandbyEnabled: config.multiAZWithStandbyEnabled,
        },
        fineGrainedAccessControl: {
            masterUserArn: config.fineGrainedManagerUserARN,
            masterUserName: adminUserSecret ? adminUserSecret.secretValueFromJson('username').toString() : undefined,
            masterUserPassword: adminUserSecret ? adminUserSecret.secretValueFromJson('password') : undefined,
            samlAuthenticationEnabled: samlAuthenticationOptions ? true : undefined,
            samlAuthenticationOptions,
        },
        nodeToNodeEncryption: config.nodeToNodeEncryptionEnabled,
        encryptionAtRest: {
            enabled: config.encryptionAtRestEnabled,
            kmsKey: earKmsKey,
        },
        enforceHttps: config.enforceHTTPS,
        tlsSecurityPolicy: config.tlsSecurityPolicy,
        ebs: {
            enabled: config.ebsEnabled,
            iops: supportsIops ? config.ebsIops : undefined,
            throughput: supportsThroughput ? config.ebsThroughput : undefined,
            volumeSize: config.ebsVolumeSize,
            volumeType: ebsVolumeType,
        },
        logging: {
            appLogEnabled: config.loggingAppLogEnabled,
            appLogGroup: appLG,
            slowSearchLogEnabled: config.slowSearchLogEnabled,
            slowSearchLogGroup: slowSearchLG,
            auditLogEnabled: config.auditLogEnabled,
            auditLogGroup: auditLG,
        },
        vpc: vpcDetails?.vpc,
        vpcSubnets: domainSubnets,
        securityGroups: securityGroups.length > 0 ? securityGroups : undefined,
        zoneAwareness: zoneAwarenessConfig,
        coldStorageEnabled: config.coldStorageEnabled,
        offPeakWindowEnabled: config.offPeakWindowEnabled,
        removalPolicy: config.domainRemovalPolicy,
        customEndpoint: config.customEndpoint && config.customEndpointCertificateArn ? {
            domainName: config.customEndpoint,
            certificate: undefined as never, // Set via L1 below
        } : undefined,
    });

    // Configure L1 properties not exposed by L2 construct
    const cfnDomain = domain.node.defaultChild as CfnDomain;

    // Set access policies inline on the domain. When useUnsignedBasicAuth is set,
    // L2 auto-creates an AccessPolicy custom resource with an unsigned ESHttp* policy;
    // remove it and merge the unsigned statement into our inline document instead.
    if (config.useUnsignedBasicAuth) {
        domain.node.tryRemoveChild('AccessPolicy');
        accessPolicyDoc = accessPolicyDoc ?? {Version: "2012-10-17", Statement: []};
        (accessPolicyDoc.Statement as unknown[]).push({
            Effect: "Allow",
            Principal: {AWS: "*"},
            Action: "es:ESHttp*",
            Resource: `arn:${stack.partition}:es:${stack.region}:${stack.account}:domain/${config.clusterName}/*`,
        });
    }
    if (accessPolicyDoc) {
        cfnDomain.accessPolicies = accessPolicyDoc;
    }

    // Auto-Tune
    if (config.autoTuneEnabled !== undefined) {
        cfnDomain.addPropertyOverride('AutoTuneOptions', {
            DesiredState: config.autoTuneEnabled ? 'ENABLED' : 'DISABLED',
        });
    }

    // Cognito authentication (L1 — the L2 construct's cognitoDashboardsAuth requires importing the Role object)
    if (config.cognitoUserPoolId && config.cognitoIdentityPoolId && config.cognitoRoleArn) {
        cfnDomain.addPropertyOverride('CognitoOptions', {
            Enabled: true,
            UserPoolId: config.cognitoUserPoolId,
            IdentityPoolId: config.cognitoIdentityPoolId,
            RoleArn: config.cognitoRoleArn,
        });
    }

    // Custom endpoint certificate (L1 — the L2 construct requires a Certificate object)
    if (config.customEndpoint && config.customEndpointCertificateArn) {
        cfnDomain.addPropertyOverride('DomainEndpointOptions.CustomEndpointEnabled', true);
        cfnDomain.addPropertyOverride('DomainEndpointOptions.CustomEndpoint', config.customEndpoint);
        cfnDomain.addPropertyOverride('DomainEndpointOptions.CustomEndpointCertificateArn', config.customEndpointCertificateArn);
    }

    NagSuppressions.addResourceSuppressions(domain, [
        {id: 'AwsSolutions-OS3', reason: 'IP-based access policies are user-configurable via accessPolicies context option'},
        {id: 'AwsSolutions-OS4', reason: 'Dedicated master nodes are user-configurable via dedicatedManagerNodeType/Count context options'},
        {id: 'AwsSolutions-OS5', reason: 'Unsigned basic auth and fine-grained access control are user-configurable context options'},
        {id: 'AwsSolutions-OS9', reason: 'Log publishing is user-configurable via loggingAppLogEnabled, slowSearchLogEnabled, and auditLogEnabled context options'},
    ]);

    generateClusterExports(stack, domain, config.clusterId, stage, vpcDetails?.subnetSelection, vpcDetails?.clusterAccessSecurityGroup?.securityGroupId);
}

function getEbsVolumeType(ebsVolumeTypeName: string): EbsDeviceVolumeType | undefined {
    const ebsVolumeType = ebsVolumeTypeName ? EbsDeviceVolumeType[ebsVolumeTypeName as keyof typeof EbsDeviceVolumeType] : undefined;
    if (ebsVolumeTypeName && !ebsVolumeType) {
        throw new Error("Provided ebsVolumeType does not match a selectable option, for reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html");
    }
    return ebsVolumeType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateAccessPolicies(jsonObject: Record<string, any>, clusterId: string): Record<string, unknown> {
    const statements = jsonObject['Statement'];
    if (!statements) {
        throw new Error(`Invalid accessPolicies for cluster '${clusterId}': JSON must have a non-empty 'Statement' element. See AWS IAM policy documentation for proper format: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_statement.html`);
    }
    const statementList = Array.isArray(statements) ? statements : [statements];
    if (statementList.length < 1) {
        throw new Error(`Invalid accessPolicies for cluster '${clusterId}': 'Statement' must be a non-empty array or object. See AWS IAM policy documentation for proper format: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_statement.html`);
    }
    for (const s of statementList) {
        if (!s || typeof s !== 'object' || !('Effect' in s) || !('Action' in s)) {
            throw new Error(`Invalid accessPolicies for cluster '${clusterId}': each Statement must include at least 'Effect' and 'Action'. See AWS IAM policy documentation for proper format: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_statement.html`);
        }
    }
    // Pass user-supplied JSON through verbatim — CFN's
    // AWS::OpenSearchService::Domain.AccessPolicies accepts an inline IAM policy document.
    return jsonObject;
}

function validateNodeCounts(numAZs: number, config: ManagedClusterConfig) {
    if (config.dataNodeCount && config.dataNodeCount % numAZs !== 0) {
        throw new Error(`The number of data nodes must be a multiple of the number of Availability Zones. Received 'dataNodeCount' of ${config.dataNodeCount} with AZ count of ${numAZs}`);
    }
    if (config.dedicatedManagerNodeCount && (config.dedicatedManagerNodeCount !== 3 && config.dedicatedManagerNodeCount !== 5)) {
        throw new Error(`The number of dedicated manager nodes must be 3 or 5 for high availability. Received 'dedicatedManagerNodeCount' of ${config.dedicatedManagerNodeCount}`);
    }
    if (config.warmNodeCount && config.warmNodeCount % numAZs !== 0) {
        throw new Error(`The number of warm nodes must be a multiple of the number of Availability Zones. Received 'warmNodesCount' of ${config.warmNodeCount} with AZ count of ${numAZs}`);
    }
}

function generateClusterExports(stack: Stack, domain: Domain, clusterId: string, stage: string, subnetSelection?: SubnetSelection, clusterAccessSecurityGroupId?: string) {
    new CfnOutput(stack, `ClusterEndpointExport-${stage}-${clusterId}`, {
        exportName: `ClusterEndpoint-${stage}-${clusterId}`,
        value: domain.domainEndpoint,
        description: 'The endpoint URL of the cluster',
    });

    new CfnOutput(stack, `DomainEndpointExport-${stage}-${clusterId}`, {
        exportName: `DomainEndpoint-${stage}-${clusterId}`,
        value: `https://${domain.domainEndpoint}`,
        description: 'The full HTTPS endpoint URL of the domain',
    });

    new CfnOutput(stack, `DomainArnExport-${stage}-${clusterId}`, {
        exportName: `DomainArn-${stage}-${clusterId}`,
        value: domain.domainArn,
        description: 'The ARN of the OpenSearch domain',
    });

    if (subnetSelection?.subnets) {
        const subnetIds = subnetSelection.subnets.map(s => s.subnetId);
        new CfnOutput(stack, `ClusterSubnets-${stage}-${clusterId}`, {
            exportName: `ClusterSubnets-${stage}-${clusterId}`,
            value: subnetIds.join(","),
            description: 'The subnet ids of the deployed cluster',
        });
    }
    if (clusterAccessSecurityGroupId) {
        new CfnOutput(stack, `ClusterAccessSecurityGroupIdExport-${stage}-${clusterId}`, {
            exportName: `ClusterAccessSecurityGroupId-${stage}-${clusterId}`,
            value: clusterAccessSecurityGroupId,
            description: 'The cluster access security group id',
        });
    }
}
