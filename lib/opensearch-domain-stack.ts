import {Construct} from "constructs";
import {EbsDeviceVolumeType, ISecurityGroup, SecurityGroup, SubnetSelection} from "aws-cdk-lib/aws-ec2";
import {Domain, ZoneAwarenessConfig} from "aws-cdk-lib/aws-opensearchservice";
import {CustomResource, Duration, Stack, StackProps} from "aws-cdk-lib";
import {IKey, Key} from "aws-cdk-lib/aws-kms";
import {AnyPrincipal, Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {ILogGroup, LogGroup} from "aws-cdk-lib/aws-logs";
import {ISecret, Secret} from "aws-cdk-lib/aws-secretsmanager";
import {Code, Function as LambdaFunction, Runtime} from "aws-cdk-lib/aws-lambda";
import {Provider} from "aws-cdk-lib/custom-resources";
import {NagSuppressions} from "cdk-nag";
import {VpcDetails} from "./components/vpc-details";
import {
  createBasicAuthSecret,
  generateClusterExports,
  getEngineVersion,
  LATEST_AOS_VERSION,
} from "./components/common-utilities";
import {ManagedClusterConfig} from "./components/cluster-config";

export interface OpenSearchDomainStackProps extends StackProps {
  readonly stage: string;
  readonly config: ManagedClusterConfig;
  readonly vpcDetails?: VpcDetails;
  readonly vpcId?: string;
}

export class OpenSearchDomainStack extends Stack {

  private getEbsVolumeType(ebsVolumeTypeName: string): EbsDeviceVolumeType | undefined {
    const ebsVolumeType: EbsDeviceVolumeType | undefined = ebsVolumeTypeName ? EbsDeviceVolumeType[ebsVolumeTypeName as keyof typeof EbsDeviceVolumeType] : undefined;
    if (ebsVolumeTypeName && !ebsVolumeType) {
      throw new Error("Provided ebsVolumeType does not match a selectable option, for reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html");
    }
    return ebsVolumeType;
  }

  private createOpenAccessPolicy(domainName: string) {
    return new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [new AnyPrincipal()],
      actions: ["es:*"],
      resources: [`arn:${this.partition}:es:${this.region}:${this.account}:domain/${domainName}/*`],
    });
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

  private createVpcValidation(domainName: string, expectedVpcId: string): CustomResource {
    const validationFn = new LambdaFunction(this, 'VpcValidationFunction', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.seconds(30),
      code: Code.fromInline(`
const { OpenSearchClient, DescribeDomainCommand } = require("@aws-sdk/client-opensearch");
exports.handler = async (event) => {
  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: event.PhysicalResourceId };
  }
  const domainName = event.ResourceProperties.DomainName;
  const expectedVpcId = event.ResourceProperties.ExpectedVpcId;
  const client = new OpenSearchClient();
  try {
    const resp = await client.send(new DescribeDomainCommand({ DomainName: domainName }));
    const existingVpcId = resp.DomainStatus?.VPCOptions?.VPCId;
    if (existingVpcId && existingVpcId !== expectedVpcId) {
      throw new Error(
        "VPC mismatch: OpenSearch domain '" + domainName + "' exists in VPC " + existingVpcId +
        " but the deployment targets VPC " + expectedVpcId + ". OpenSearch domains cannot be moved " +
        "between VPCs. Delete the existing domain (and its CloudFormation stack) first, then redeploy."
      );
    }
  } catch (e) {
    if (e.name === "ResourceNotFoundException") {
      // Domain doesn't exist yet — no validation needed
    } else {
      throw e;
    }
  }
  return { PhysicalResourceId: domainName + "-vpc-check" };
};
      `),
    });

    validationFn.addToRolePolicy(new PolicyStatement({
      actions: ['es:DescribeDomain'],
      resources: [`arn:${this.partition}:es:${this.region}:${this.account}:domain/${domainName}`],
    }));

    const provider = new Provider(this, 'VpcValidationProvider', {
      onEventHandler: validationFn,
    });

    return new CustomResource(this, 'VpcValidation', {
      serviceToken: provider.serviceToken,
      properties: {
        DomainName: domainName,
        ExpectedVpcId: expectedVpcId,
      },
    });
  }

  constructor(scope: Construct, id: string, props: OpenSearchDomainStackProps) {
    super(scope, id, props);

    const { config, stage } = props;

    // Resolve VPC details: either passed directly (created VPC) or looked up by ID
    if (!props.vpcDetails && !props.vpcId) {
      throw new Error("Either 'vpcDetails' or 'vpcId' must be provided for managed OpenSearch domains");
    }
    const vpcDetails = props.vpcDetails
      ?? VpcDetails.fromVpcLookup(this, props.vpcId as string, config.clusterId, config.clusterSubnetIds);

    // Skip accessing VPC for first synthesis stage which hasn't yet loaded in the VPC details from lookup
    if (vpcDetails.vpc.vpcId === "vpc-12345") {
      return;
    }

    const version = config.clusterVersion
      ? getEngineVersion(config.clusterVersion)
      : getEngineVersion(LATEST_AOS_VERSION);

    // Validate VPC hasn't changed for existing domains
    const vpcValidation = this.createVpcValidation(config.clusterName, vpcDetails.vpc.vpcId);

    // Retrieve existing account resources if defined
    const earKmsKey: IKey | undefined = config.encryptionAtRestKmsKeyARN && config.encryptionAtRestEnabled
      ? Key.fromKeyArn(this, "earKey", config.encryptionAtRestKmsKeyARN) : undefined;

    const appLG: ILogGroup | undefined = config.loggingAppLogGroupARN && config.loggingAppLogEnabled
      ? LogGroup.fromLogGroupArn(this, "appLogGroup", config.loggingAppLogGroupARN) : undefined;

    let adminUserSecret: ISecret | undefined = config.fineGrainedManagerUserSecretARN
      ? Secret.fromSecretCompleteArn(this, "managerSecret", config.fineGrainedManagerUserSecretARN) : undefined;
    if (config.enableDemoAdmin) {
      adminUserSecret = createBasicAuthSecret(scope, "admin", "myStrongPassword123!", stage, config.clusterId);
    }

    const numSubnets = vpcDetails.subnetSelection.subnets;
    if (!numSubnets || numSubnets.length < 1) {
      throw new Error("Internal error: There should always be at least 1 subnet in the VpcDetails subnet selection");
    }
    const numAZs = numSubnets.length;
    this.validateNodeCounts(numAZs, config);
    const zoneAwarenessConfig: ZoneAwarenessConfig | undefined = numAZs > 1
      ? { enabled: true, availabilityZoneCount: numAZs } : undefined;

    const domainSubnets: SubnetSelection[] = [vpcDetails.subnetSelection];

    // Retrieve existing SGs to apply to VPC Domain endpoints
    const securityGroups: ISecurityGroup[] = [];
    if (vpcDetails.clusterAccessSecurityGroup) {
      securityGroups.push(vpcDetails.clusterAccessSecurityGroup);
    }
    if (config.clusterSecurityGroupIds) {
      for (let i = 0; i < config.clusterSecurityGroupIds.length; i++) {
        securityGroups.push(SecurityGroup.fromLookupById(this, "domainSecurityGroup-" + i, config.clusterSecurityGroupIds[i]));
      }
    }

    const ebsVolumeType = config.ebsVolumeType ? this.getEbsVolumeType(config.ebsVolumeType) : undefined;

    // Only GP3, IO1, and IO2 support custom IOPS; only GP3 supports custom throughput
    const supportsIops = ebsVolumeType === EbsDeviceVolumeType.GP3
      || ebsVolumeType === EbsDeviceVolumeType.IO1
      || ebsVolumeType === EbsDeviceVolumeType.IO2;
    const supportsThroughput = ebsVolumeType === EbsDeviceVolumeType.GP3;

    let accessPolicies: PolicyStatement[] | undefined;
    if (config.openAccessPolicyEnabled) {
      accessPolicies = [this.createOpenAccessPolicy(config.clusterName)];
    } else {
      accessPolicies = config.accessPolicies ? this.parseAccessPolicies(config.accessPolicies, config.clusterId) : undefined;
    }

    const domain = new Domain(this, 'Domain', {
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
      },
      fineGrainedAccessControl: {
        masterUserArn: config.fineGrainedManagerUserARN,
        masterUserName: adminUserSecret ? adminUserSecret.secretValueFromJson('username').toString() : undefined,
        masterUserPassword: adminUserSecret ? adminUserSecret.secretValueFromJson('password') : undefined,
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
      removalPolicy: config.domainRemovalPolicy,
    });

    domain.node.addDependency(vpcValidation);

    // cdk-nag suppressions for user-configurable options and CDK framework internals
    NagSuppressions.addResourceSuppressions(domain, [
      { id: 'AwsSolutions-OS3', reason: 'IP-based access policies are user-configurable via accessPolicies context option' },
      { id: 'AwsSolutions-OS4', reason: 'Dedicated master nodes are user-configurable via dedicatedManagerNodeType/Count context options' },
      { id: 'AwsSolutions-OS5', reason: 'Unsigned basic auth and fine-grained access control are user-configurable context options' },
      { id: 'AwsSolutions-OS9', reason: 'Slow log publishing is user-configurable via loggingAppLogEnabled context option' },
    ]);
    NagSuppressions.addResourceSuppressions(this, [
      { id: 'AwsSolutions-IAM4', reason: 'VPC validation custom resource uses AWSLambdaBasicExecutionRole managed policy for CloudWatch Logs access', appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'] },
      { id: 'AwsSolutions-IAM5', reason: 'CDK custom resource framework requires invoke permission with :* suffix on the Lambda ARN' },
      { id: 'AwsSolutions-L1', reason: 'VPC validation Lambda uses Node.js 22.x (current LTS); CDK Provider framework Lambda runtime is managed by aws-cdk-lib' },
    ], true);

    generateClusterExports(this, domain.domainEndpoint, config.clusterId, stage, vpcDetails.subnetSelection, vpcDetails.clusterAccessSecurityGroup?.securityGroupId);
  }
}
