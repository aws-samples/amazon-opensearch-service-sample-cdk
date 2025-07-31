import {Construct} from "constructs";
import {EbsDeviceVolumeType, ISecurityGroup, SecurityGroup, SubnetSelection} from "aws-cdk-lib/aws-ec2";
import {Domain, EngineVersion, TLSSecurityPolicy, ZoneAwarenessConfig} from "aws-cdk-lib/aws-opensearchservice";
import {RemovalPolicy, Stack} from "aws-cdk-lib";
import {IKey, Key} from "aws-cdk-lib/aws-kms";
import {AnyPrincipal, Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {ILogGroup, LogGroup} from "aws-cdk-lib/aws-logs";
import {ISecret, Secret} from "aws-cdk-lib/aws-secretsmanager";
import {StackPropsExt} from "./stack-composer";
import {VpcDetails} from "./utils/vpc-details";
import {
  createBasicAuthSecret,
  generateClusterExports,
  getEngineVersion,
  LATEST_AOS_VERSION,
} from "./utils/common-utilities";
import {ClusterConfig} from "./utils/cluster-config";
import {Environment} from "aws-cdk-lib/core/lib/environment";


export interface OpensearchDomainStackProps extends StackPropsExt {
  readonly version: EngineVersion,
  readonly domainName: string,
  readonly clusterId: string,
  readonly dataNodeInstanceType?: string,
  readonly dataNodes?: number,
  readonly dedicatedManagerNodeType?: string,
  readonly dedicatedManagerNodeCount?: number,
  readonly warmInstanceType?: string,
  readonly warmNodes?: number
  readonly accessPolicyJson?: object,
  readonly openAccessPolicyEnabled?: boolean
  readonly useUnsignedBasicAuth?: boolean,
  readonly fineGrainedManagerUserARN?: string,
  readonly fineGrainedManagerUserSecretARN?: string,
  readonly enableDemoAdmin?: boolean,
  readonly enforceHTTPS?: boolean,
  readonly tlsSecurityPolicy?: TLSSecurityPolicy,
  readonly ebsEnabled?: boolean,
  readonly ebsIops?: number,
  readonly ebsVolumeSize?: number,
  readonly ebsVolumeTypeName?: string,
  readonly encryptionAtRestEnabled?: boolean,
  readonly encryptionAtRestKmsKeyARN?: string,
  readonly appLogEnabled?: boolean,
  readonly appLogGroup?: string,
  readonly nodeToNodeEncryptionEnabled?: boolean,
  readonly vpcDetails: VpcDetails,
  readonly vpcSecurityGroupIds?: string[],
  readonly domainRemovalPolicy?: RemovalPolicy,
  readonly domainAccessSecurityGroupParameter?: string
}


export class OpenSearchDomainStack extends Stack {

  getEbsVolumeType(ebsVolumeTypeName: string) : EbsDeviceVolumeType|undefined {
    const ebsVolumeType: EbsDeviceVolumeType|undefined = ebsVolumeTypeName ? EbsDeviceVolumeType[ebsVolumeTypeName as keyof typeof EbsDeviceVolumeType] : undefined
    if (ebsVolumeTypeName && !ebsVolumeType) {
        throw new Error("Provided ebsVolumeType does not match a selectable option, for reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html")
    }
    return ebsVolumeType
  }

  createOpenAccessPolicy(domainName: string) {
    return new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new AnyPrincipal()],
        actions: ["es:*"],
        resources: [`arn:${this.partition}:es:${this.region}:${this.account}:domain/${domainName}/*`]
      })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseAccessPolicies(jsonObject: Record<string, any>): PolicyStatement[] {
    const accessPolicies: PolicyStatement[] = []
    const statements = jsonObject['Statement']
    if (!statements || statements.length < 1) {
        throw new Error ("Provided accessPolicies JSON must have the 'Statement' element present and not be empty, for reference https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_statement.html")
    }
    // Access policies can provide a single Statement block or an array of Statement blocks
    if (Array.isArray(statements)) {
        for (const statementBlock of statements) {
            const statement = PolicyStatement.fromJson(statementBlock)
            accessPolicies.push(statement)
        }
    }
    else {
        const statement = PolicyStatement.fromJson(statements)
        accessPolicies.push(statement)
    }
    return accessPolicies
  }

  validateNodeCounts(numAZs: number, props: OpensearchDomainStackProps) {
    if (props.dataNodes && props.dataNodes % numAZs != 0) {
      throw new Error(`The number of data nodes must be a multiple of the number of Availability Zones. Received 'dataNodeCount' of ${props.dataNodes} with AZ count of ${numAZs}`)
    }
    if (props.dedicatedManagerNodeCount && props.dedicatedManagerNodeCount % numAZs != 0) {
      throw new Error(`The number of manager nodes must be a multiple of the number of Availability Zones. Received 'dedicatedManagerNodeCount' of ${props.dedicatedManagerNodeCount} with AZ count of ${numAZs}`)
    }
    if (props.warmNodes && props.warmNodes % numAZs != 0) {
      throw new Error(`The number of warm nodes must be a multiple of the number of Availability Zones. Received 'warmNodesCount' of ${props.warmNodes} with AZ count of ${numAZs}`)
    }
  }

  constructor(scope: Construct, id: string, props: OpensearchDomainStackProps) {
    super(scope, id, props);

    props.vpcDetails.initialize(this, props.clusterId)

    // Retrieve existing account resources if defined
    const earKmsKey: IKey|undefined = props.encryptionAtRestKmsKeyARN && props.encryptionAtRestEnabled ?
        Key.fromKeyArn(this, "earKey", props.encryptionAtRestKmsKeyARN) : undefined

    const appLG: ILogGroup|undefined = props.appLogGroup && props.appLogEnabled ?
        LogGroup.fromLogGroupArn(this, "appLogGroup", props.appLogGroup) : undefined

    let adminUserSecret: ISecret|undefined = props.fineGrainedManagerUserSecretARN ?
        Secret.fromSecretCompleteArn(this, "managerSecret", props.fineGrainedManagerUserSecretARN) : undefined
    if (props.enableDemoAdmin) {
      adminUserSecret = createBasicAuthSecret(scope, "admin", "myStrongPassword123!", props.stage, props.clusterId)
    }

    const numSubnets = props.vpcDetails.subnetSelection.subnets
    if (!numSubnets || numSubnets.length < 1) {
      throw new Error("Internal error: There should always be at least 1 subnet in the VpcDetails subnet selection")
    }
    // We enforce that only one subnet is provided per AZ
    const numAZs = numSubnets.length
    this.validateNodeCounts(numAZs, props)
    const zoneAwarenessConfig: ZoneAwarenessConfig|undefined = numAZs > 1 ?
        {enabled: true, availabilityZoneCount: numAZs} : undefined;

    // If specified, these subnets will be selected to place the Domain nodes in. Otherwise, this is not provided
    // to the Domain as it has existing behavior to select private subnets from a given VPC
    let domainSubnets: SubnetSelection[]|undefined;
    if (props.vpcDetails) {
      domainSubnets = [props.vpcDetails.subnetSelection]
    }

    // Retrieve existing SGs to apply to VPC Domain endpoints
    const securityGroups: ISecurityGroup[] = []
    if (props.vpcDetails.defaultSecurityGroup) {
      securityGroups.push(props.vpcDetails.defaultSecurityGroup)
    }
    if (props.vpcSecurityGroupIds) {
      for (let i = 0; i < props.vpcSecurityGroupIds.length; i++) {
        securityGroups.push(SecurityGroup.fromLookupById(this, "domainSecurityGroup-" + i, props.vpcSecurityGroupIds[i]))
      }
    }

    const ebsVolumeType = props.ebsVolumeTypeName ? this.getEbsVolumeType(props.ebsVolumeTypeName) : undefined

    let accessPolicies: PolicyStatement[] | undefined
    if (props.openAccessPolicyEnabled) {
      accessPolicies = [this.createOpenAccessPolicy(props.domainName)]
    } else {
      accessPolicies = props.accessPolicyJson ? this.parseAccessPolicies(props.accessPolicyJson) : undefined
    }

    const domain = new Domain(this, 'Domain', {
      version: props.version,
      domainName: props.domainName,
      accessPolicies: accessPolicies,
      useUnsignedBasicAuth: props.useUnsignedBasicAuth,
      capacity: {
        dataNodeInstanceType: props.dataNodeInstanceType,
        dataNodes: props.dataNodes ?? numAZs,
        masterNodeInstanceType: props.dedicatedManagerNodeType,
        masterNodes: props.dedicatedManagerNodeCount,
        warmInstanceType: props.warmInstanceType,
        warmNodes: props.warmNodes
      },
      fineGrainedAccessControl: {
        masterUserArn: props.fineGrainedManagerUserARN,
        masterUserName: adminUserSecret ? adminUserSecret.secretValueFromJson('username').toString() : undefined,
        masterUserPassword: adminUserSecret ? adminUserSecret.secretValueFromJson('password') : undefined,
      },
      nodeToNodeEncryption: props.nodeToNodeEncryptionEnabled,
      encryptionAtRest: {
        enabled: props.encryptionAtRestEnabled,
        kmsKey: earKmsKey
      },
      enforceHttps: props.enforceHTTPS,
      tlsSecurityPolicy: props.tlsSecurityPolicy,
      ebs: {
        enabled: props.ebsEnabled,
        iops: props.ebsIops,
        volumeSize: props.ebsVolumeSize,
        volumeType: ebsVolumeType
      },
      logging: {
        appLogEnabled: props.appLogEnabled,
        appLogGroup: appLG
      },
      vpc: props.vpcDetails?.vpc,
      vpcSubnets: domainSubnets,
      securityGroups: securityGroups,
      zoneAwareness: zoneAwarenessConfig,
      removalPolicy: props.domainRemovalPolicy
    });
    generateClusterExports(this, domain.domainEndpoint, props.clusterId, props.stage, props.vpcDetails.defaultSecurityGroup?.securityGroupId)
  }
}

export function createOpenSearchStack(scope: Construct, config: ClusterConfig, vpcDetails: VpcDetails, stage: string, region: string, env?: Environment): Stack {

  const version = config.clusterVersion
      ? getEngineVersion(config.clusterVersion)
      : getEngineVersion(LATEST_AOS_VERSION);

  return new OpenSearchDomainStack(scope, `openSearchDomainStack-${config.clusterId}`, {
      version: version,
      domainName: config.clusterName,
      clusterId: config.clusterId,
      dataNodeInstanceType: config.dataNodeType,
      dataNodes: config.dataNodeCount,
      dedicatedManagerNodeType: config.dedicatedManagerNodeType,
      dedicatedManagerNodeCount: config.dedicatedManagerNodeCount,
      warmInstanceType: config.warmNodeType,
      warmNodes: config.warmNodeCount,
      accessPolicyJson: config.accessPolicies,
      openAccessPolicyEnabled: config.openAccessPolicyEnabled,
      useUnsignedBasicAuth: config.useUnsignedBasicAuth,
      fineGrainedManagerUserARN: config.fineGrainedManagerUserARN,
      fineGrainedManagerUserSecretARN: config.fineGrainedManagerUserSecretARN,
      enableDemoAdmin: config.enableDemoAdmin,
      enforceHTTPS: config.enforceHTTPS,
      tlsSecurityPolicy: config.tlsSecurityPolicy,
      ebsEnabled: config.ebsEnabled,
      ebsIops: config.ebsIops,
      ebsVolumeSize: config.ebsVolumeSize,
      ebsVolumeTypeName: config.ebsVolumeType,
      encryptionAtRestEnabled: config.encryptionAtRestEnabled,
      encryptionAtRestKmsKeyARN: config.encryptionAtRestKmsKeyARN,
      appLogEnabled: config.loggingAppLogEnabled,
      appLogGroup: config.loggingAppLogGroupARN,
      nodeToNodeEncryptionEnabled: config.nodeToNodeEncryptionEnabled,
      vpcDetails: vpcDetails,
      vpcSecurityGroupIds: config.clusterSecurityGroupIds,
      domainRemovalPolicy: config.domainRemovalPolicy,
      stackName: `OpenSearchDomain-${config.clusterId}-${stage}-${region}`,
      description: 'This stack contains resources to create/manage an OpenSearch Service domain',
      stage,
      env: env,
    });
}