import {Construct} from "constructs";
import {CfnOutput, Fn, RemovalPolicy, SecretValue, Stack, StackProps, Tags} from "aws-cdk-lib";
import {
    EbsDeviceVolumeType,
    FlowLogDestination, FlowLogTrafficType,
    IpAddresses, IpProtocol, ISecurityGroup, Port,
    SecurityGroup, SubnetSelection, Vpc,
} from "aws-cdk-lib/aws-ec2";
import {CfnDomain, Domain, SAMLOptionsProperty, ZoneAwarenessConfig} from "aws-cdk-lib/aws-opensearchservice";
import {IKey, Key} from "aws-cdk-lib/aws-kms";
import {AnyPrincipal, Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {ILogGroup, LogGroup} from "aws-cdk-lib/aws-logs";
import {ISecret, Secret} from "aws-cdk-lib/aws-secretsmanager";
import {
    CfnAccessPolicy,
    CfnCollection,
    CfnSecurityPolicy,
} from "aws-cdk-lib/aws-opensearchserverless";
import {NagSuppressions} from "cdk-nag";
import {VpcDetails} from "./components/vpc-details";
import {
    getEngineVersion,
    LATEST_AOS_VERSION,
} from "./components/common-utilities";
import {ManagedClusterConfig, ServerlessClusterConfig} from "./components/cluster-config";

export interface OpenSearchStackProps extends StackProps {
    readonly stage: string;
    readonly managedClusters: ManagedClusterConfig[];
    readonly serverlessClusters: ServerlessClusterConfig[];
    /** Existing VPC ID — when set, looks up the VPC instead of creating one */
    readonly vpcId?: string;
    readonly vpcAZCount?: number;
    readonly vpcCidr?: string;
}

export class OpenSearchStack extends Stack {

    constructor(scope: Construct, id: string, props: OpenSearchStackProps) {
        super(scope, id, props);

        const {stage, managedClusters, serverlessClusters} = props;
        const hasManagedClusters = managedClusters.length > 0;

        // --- VPC (only when managed clusters need it) ---
        let vpcDetails: VpcDetails | undefined;
        if (hasManagedClusters) {
            if (props.vpcId) {
                // Use the first managed cluster's config for subnet selection
                const firstConfig = managedClusters[0];
                vpcDetails = VpcDetails.fromVpcLookup(this, props.vpcId, firstConfig.clusterId, firstConfig.clusterSubnetIds);
            } else {
                const zoneCount = props.vpcAZCount ?? 2;
                if (zoneCount < 1 || zoneCount > 3) {
                    throw new Error(`The 'vpcAZCount' option must be a number between 1 - 3, but received an AZ count of ${zoneCount}`);
                }
                const cidr = props.vpcCidr ?? '10.212.0.0/16';
                const vpc = new Vpc(this, 'Vpc', {
                    ipAddresses: IpAddresses.cidr(cidr),
                    ipProtocol: IpProtocol.DUAL_STACK,
                    vpcName: `vpc-${stage}`,
                    maxAzs: zoneCount,
                    flowLogs: {
                        defaultFlowLog: {
                            destination: FlowLogDestination.toCloudWatchLogs(),
                            trafficType: FlowLogTrafficType.REJECT,
                        },
                    },
                });

                vpc.publicSubnets.forEach((subnet, index) => {
                    Tags.of(subnet).add("Name", `vpc-public-subnet-${index + 1}-${stage}`);
                });
                vpc.privateSubnets.forEach((subnet, index) => {
                    Tags.of(subnet).add("Name", `vpc-private-subnet-${index + 1}-${stage}`);
                });

                const sg = new SecurityGroup(this, 'clusterAccessVpcSecurityGroup', {
                    vpc,
                    allowAllOutbound: false,
                    allowAllIpv6Outbound: false,
                    securityGroupName: `cluster-access-security-group-${stage}`,
                });
                sg.addIngressRule(sg, Port.allTraffic());

                new CfnOutput(this, `VpcIdExport-${stage}`, {
                    exportName: `VpcId-${stage}`,
                    value: vpc.vpcId,
                    description: 'The VPC id of the created VPC',
                });

                vpcDetails = VpcDetails.fromCreatedVpc(vpc, sg);
            }
        }

        // --- Managed domains ---
        for (const config of managedClusters) {
            if (!vpcDetails) {
                throw new Error("Internal error: VPC details should be resolved for managed clusters");
            }
            this.createManagedDomain(config, stage, vpcDetails);
        }

        // --- Serverless collections ---
        for (const config of serverlessClusters) {
            this.createServerlessCollection(config, stage);
        }
    }

    private createManagedDomain(config: ManagedClusterConfig, stage: string, vpcDetails: VpcDetails) {
        const prefix = config.clusterId;

        // Skip for first synthesis stage (dummy VPC from lookup)
        if (vpcDetails.vpc.vpcId === "vpc-12345") {
            return;
        }

        const version = config.clusterVersion
            ? getEngineVersion(config.clusterVersion)
            : getEngineVersion(LATEST_AOS_VERSION);

        const earKmsKey: IKey | undefined = config.encryptionAtRestKmsKeyARN && config.encryptionAtRestEnabled
            ? Key.fromKeyArn(this, `${prefix}-earKey`, config.encryptionAtRestKmsKeyARN) : undefined;

        const appLG: ILogGroup | undefined = config.loggingAppLogGroupARN && config.loggingAppLogEnabled
            ? LogGroup.fromLogGroupArn(this, `${prefix}-appLogGroup`, config.loggingAppLogGroupARN) : undefined;

        let adminUserSecret: ISecret | undefined = config.fineGrainedManagerUserSecretARN
            ? Secret.fromSecretCompleteArn(this, `${prefix}-managerSecret`, config.fineGrainedManagerUserSecretARN) : undefined;
        if (config.enableDemoAdmin) {
            adminUserSecret = this.createBasicAuthSecret("admin", "myStrongPassword123!", stage, config.clusterId);
        }

        const numSubnets = vpcDetails.subnetSelection.subnets;
        if (!numSubnets || numSubnets.length < 1) {
            throw new Error("Internal error: There should always be at least 1 subnet in the VpcDetails subnet selection");
        }
        const numAZs = numSubnets.length;
        this.validateNodeCounts(numAZs, config);
        const zoneAwarenessConfig: ZoneAwarenessConfig | undefined = numAZs > 1
            ? {enabled: true, availabilityZoneCount: numAZs} : undefined;

        const domainSubnets: SubnetSelection[] = [vpcDetails.subnetSelection];

        const securityGroups: ISecurityGroup[] = [];
        if (vpcDetails.clusterAccessSecurityGroup) {
            securityGroups.push(vpcDetails.clusterAccessSecurityGroup);
        }
        if (config.clusterSecurityGroupIds) {
            for (let i = 0; i < config.clusterSecurityGroupIds.length; i++) {
                securityGroups.push(SecurityGroup.fromLookupById(this, `${prefix}-domainSecurityGroup-${i}`, config.clusterSecurityGroupIds[i]));
            }
        }

        const ebsVolumeType = config.ebsVolumeType ? this.getEbsVolumeType(config.ebsVolumeType) : undefined;
        const supportsIops = ebsVolumeType === EbsDeviceVolumeType.GP3
            || ebsVolumeType === EbsDeviceVolumeType.IO1
            || ebsVolumeType === EbsDeviceVolumeType.IO2;
        const supportsThroughput = ebsVolumeType === EbsDeviceVolumeType.GP3;

        let accessPolicies: PolicyStatement[] | undefined;
        if (config.openAccessPolicyEnabled) {
            accessPolicies = [new PolicyStatement({
                effect: Effect.ALLOW,
                principals: [new AnyPrincipal()],
                actions: ["es:*"],
                resources: [`arn:${this.partition}:es:${this.region}:${this.account}:domain/${config.clusterName}/*`],
            })];
        } else {
            accessPolicies = config.accessPolicies ? this.parseAccessPolicies(config.accessPolicies, config.clusterId) : undefined;
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

        const domain = new Domain(this, `${prefix}-Domain`, {
            version,
            domainName: config.clusterName,
            accessPolicies,
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
            },
            vpc: vpcDetails.vpc,
            vpcSubnets: domainSubnets,
            securityGroups,
            zoneAwareness: zoneAwarenessConfig,
            coldStorageEnabled: config.coldStorageEnabled,
            offPeakWindowEnabled: config.offPeakWindowEnabled,
            removalPolicy: config.domainRemovalPolicy,
        });

        NagSuppressions.addResourceSuppressions(domain, [
            {id: 'AwsSolutions-OS3', reason: 'IP-based access policies are user-configurable via accessPolicies context option'},
            {id: 'AwsSolutions-OS4', reason: 'Dedicated master nodes are user-configurable via dedicatedManagerNodeType/Count context options'},
            {id: 'AwsSolutions-OS5', reason: 'Unsigned basic auth and fine-grained access control are user-configurable context options'},
            {id: 'AwsSolutions-OS9', reason: 'Slow log publishing is user-configurable via loggingAppLogEnabled context option'},
        ]);

        this.generateClusterExports(domain, config.clusterId, stage, vpcDetails.subnetSelection, vpcDetails.clusterAccessSecurityGroup?.securityGroupId);
    }

    private createServerlessCollection(config: ServerlessClusterConfig, stage: string) {
        const prefix = config.clusterId;

        // Build the list of collections to create.
        // When `collections` is provided, each entry becomes a separate CfnCollection
        // sharing the same encryption, network, and data-access policies.
        // Otherwise, fall back to a single collection using the top-level fields.
        const entries: { name: string; type: string }[] = [];
        if (config.collections && config.collections.length > 0) {
            for (const c of config.collections) {
                if (!c.collectionName) {
                    throw new Error(`Each entry in 'collections' for cluster '${config.clusterId}' must have a 'collectionName'`);
                }
                entries.push({
                    name: c.collectionName,
                    type: this.validateCollectionType(c.collectionType ?? config.collectionType ?? 'SEARCH', config.clusterId),
                });
            }
        } else {
            entries.push({
                name: config.clusterName,
                type: this.validateCollectionType(config.collectionType ?? 'SEARCH', config.clusterId),
            });
        }

        const standbyReplicas = config.standbyReplicas ?? 'ENABLED';
        if (!['ENABLED', 'DISABLED'].includes(standbyReplicas)) {
            throw new Error(
                `Invalid 'standbyReplicas' for cluster '${config.clusterId}': '${standbyReplicas}'. ` +
                `Valid options are: ENABLED, DISABLED`
            );
        }

        // Shared encryption policy covering all collections in the group
        const collectionResources = entries.map(e => `collection/${e.name}`);
        const encryptionPolicy = new CfnSecurityPolicy(this, `${prefix}-EncryptionPolicy`, {
            name: `${config.clusterName}-enc`,
            type: 'encryption',
            policy: JSON.stringify({
                Rules: [{ResourceType: 'collection', Resource: collectionResources}],
                AWSOwnedKey: true,
            }),
        });

        // Shared network policy
        const networkPolicyRules = [
            {ResourceType: 'collection', Resource: collectionResources},
            {ResourceType: 'dashboard', Resource: collectionResources},
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const networkPolicyEntry: Record<string, any> = {Rules: networkPolicyRules};
        if (config.vpcEndpointId) {
            networkPolicyEntry.AllowFromPublic = false;
            networkPolicyEntry.SourceVPCEs = [config.vpcEndpointId];
        } else {
            networkPolicyEntry.AllowFromPublic = true;
        }

        const networkPolicy = new CfnSecurityPolicy(this, `${prefix}-NetworkPolicy`, {
            name: `${config.clusterName}-net`,
            type: 'network',
            policy: JSON.stringify([networkPolicyEntry]),
        });

        // Create each collection
        for (const entry of entries) {
            const collectionId = entries.length > 1 ? `${prefix}-${entry.name}` : prefix;

            const collection = new CfnCollection(this, `${collectionId}-Collection`, {
                name: entry.name,
                type: entry.type,
                standbyReplicas: standbyReplicas,
            });

            collection.addDependency(encryptionPolicy);
            collection.addDependency(networkPolicy);

            if (config.domainRemovalPolicy === RemovalPolicy.DESTROY) {
                collection.applyRemovalPolicy(RemovalPolicy.DESTROY);
            }

            new CfnOutput(this, `CollectionEndpointExport-${stage}-${collectionId}`, {
                exportName: `CollectionEndpoint-${stage}-${collectionId}`,
                value: collection.attrCollectionEndpoint,
                description: `The endpoint URL of the ${entry.name} serverless collection`,
            });

            new CfnOutput(this, `CollectionArnExport-${stage}-${collectionId}`, {
                exportName: `CollectionArn-${stage}-${collectionId}`,
                value: collection.attrArn,
                description: `The ARN of the ${entry.name} serverless collection`,
            });
        }

        // Shared data access policy covering all collections
        const indexResources = entries.map(e => `index/${e.name}/*`);
        new CfnAccessPolicy(this, `${prefix}-DataAccessPolicy`, {
            name: `${config.clusterName}-access`,
            type: 'data',
            policy: JSON.stringify([{
                Rules: [{
                    ResourceType: 'collection',
                    Resource: collectionResources,
                    Permission: [
                        'aoss:CreateCollectionItems', 'aoss:DeleteCollectionItems',
                        'aoss:UpdateCollectionItems', 'aoss:DescribeCollectionItems',
                    ],
                }, {
                    ResourceType: 'index',
                    Resource: indexResources,
                    Permission: [
                        'aoss:CreateIndex', 'aoss:DeleteIndex', 'aoss:UpdateIndex',
                        'aoss:DescribeIndex', 'aoss:ReadDocument', 'aoss:WriteDocument',
                    ],
                }],
                Principal: config.dataAccessPrincipals ?? [`arn:${this.partition}:iam::${this.account}:root`],
            }]),
        });
    }

    private validateCollectionType(collectionType: string, clusterId: string): string {
        const validTypes = ['SEARCH', 'TIMESERIES', 'VECTORSEARCH'];
        if (!validTypes.includes(collectionType)) {
            throw new Error(
                `Invalid 'collectionType' for cluster '${clusterId}': '${collectionType}'. ` +
                `Valid options are: ${validTypes.join(', ')}`
            );
        }
        return collectionType;
    }

    private getEbsVolumeType(ebsVolumeTypeName: string): EbsDeviceVolumeType | undefined {
        const ebsVolumeType = ebsVolumeTypeName ? EbsDeviceVolumeType[ebsVolumeTypeName as keyof typeof EbsDeviceVolumeType] : undefined;
        if (ebsVolumeTypeName && !ebsVolumeType) {
            throw new Error("Provided ebsVolumeType does not match a selectable option, for reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html");
        }
        return ebsVolumeType;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseAccessPolicies(jsonObject: Record<string, any>, clusterId: string): PolicyStatement[] {
        const accessPolicies: PolicyStatement[] = [];
        const statements = jsonObject['Statement'];
        if (!statements || statements.length < 1) {
            throw new Error(`Invalid accessPolicies for cluster '${clusterId}': JSON must have a non-empty 'Statement' element. See AWS IAM policy documentation for proper format: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_statement.html`);
        }
        if (Array.isArray(statements)) {
            for (const statementBlock of statements) {
                accessPolicies.push(PolicyStatement.fromJson(statementBlock));
            }
        } else {
            accessPolicies.push(PolicyStatement.fromJson(statements));
        }
        return accessPolicies;
    }

    private validateNodeCounts(numAZs: number, config: ManagedClusterConfig) {
        if (config.dataNodeCount && config.dataNodeCount % numAZs !== 0) {
            throw new Error(`The number of data nodes must be a multiple of the number of Availability Zones. Received 'dataNodeCount' of ${config.dataNodeCount} with AZ count of ${numAZs}`);
        }
        if (config.dedicatedManagerNodeCount && config.dedicatedManagerNodeCount % numAZs !== 0) {
            throw new Error(`The number of manager nodes must be a multiple of the number of Availability Zones. Received 'dedicatedManagerNodeCount' of ${config.dedicatedManagerNodeCount} with AZ count of ${numAZs}`);
        }
        if (config.warmNodeCount && config.warmNodeCount % numAZs !== 0) {
            throw new Error(`The number of warm nodes must be a multiple of the number of Availability Zones. Received 'warmNodesCount' of ${config.warmNodeCount} with AZ count of ${numAZs}`);
        }
    }

    private createBasicAuthSecret(username: string, password: string, stage: string, clusterId: string): Secret {
        return new Secret(this, `${clusterId}ClusterBasicAuthSecret`, {
            secretName: `${clusterId}-cluster-basic-auth-secret-${stage}`,
            secretObjectValue: {
                username: SecretValue.unsafePlainText(username),
                password: SecretValue.unsafePlainText(password),
            },
        });
    }

    private generateClusterExports(domain: Domain, clusterId: string, stage: string, subnetSelection: SubnetSelection, clusterAccessSecurityGroupId?: string) {
        new CfnOutput(this, `ClusterEndpointExport-${stage}-${clusterId}`, {
            exportName: `ClusterEndpoint-${stage}-${clusterId}`,
            value: domain.domainEndpoint,
            description: 'The endpoint URL of the cluster',
        });

        // Domain endpoint with https:// prefix for direct use
        new CfnOutput(this, `DomainEndpointExport-${stage}-${clusterId}`, {
            exportName: `DomainEndpoint-${stage}-${clusterId}`,
            value: `https://${domain.domainEndpoint}`,
            description: 'The full HTTPS endpoint URL of the domain',
        });

        // VPC endpoint — all managed domains in this project are VPC-enabled
        const cfnDomain = domain.node.defaultChild as CfnDomain;
        new CfnOutput(this, `DomainVpcEndpointExport-${stage}-${clusterId}`, {
            exportName: `DomainVpcEndpoint-${stage}-${clusterId}`,
            value: Fn.join('', ['https://', cfnDomain.getAtt('DomainEndpoints.vpc').toString()]),
            description: 'The VPC endpoint URL of the domain',
        });

        // Domain ARN
        new CfnOutput(this, `DomainArnExport-${stage}-${clusterId}`, {
            exportName: `DomainArn-${stage}-${clusterId}`,
            value: domain.domainArn,
            description: 'The ARN of the OpenSearch domain',
        });

        if (subnetSelection.subnets) {
            const subnetIds = subnetSelection.subnets.map(s => s.subnetId);
            new CfnOutput(this, `ClusterSubnets-${stage}-${clusterId}`, {
                exportName: `ClusterSubnets-${stage}-${clusterId}`,
                value: subnetIds.join(","),
                description: 'The subnet ids of the deployed cluster',
            });
        }
        if (clusterAccessSecurityGroupId) {
            new CfnOutput(this, `ClusterAccessSecurityGroupIdExport-${stage}-${clusterId}`, {
                exportName: `ClusterAccessSecurityGroupId-${stage}-${clusterId}`,
                value: clusterAccessSecurityGroupId,
                description: 'The cluster access security group id',
            });
        }
    }
}
