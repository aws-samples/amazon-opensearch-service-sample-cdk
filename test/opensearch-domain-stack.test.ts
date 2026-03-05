import { Template } from 'aws-cdk-lib/assertions';
import {createStackComposer, createStackComposerWithSingleDomainContext, getStack} from "./test-utils";
import {describe, afterEach, test, vi, expect} from 'vitest';
import {ClusterType} from "../lib/components/common-utilities";

describe('Managed Domain Tests', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test('Test empty string provided for a parameter which has a default value, uses the default value', () => {
    const composer = createStackComposerWithSingleDomainContext({encryptionAtRestEnabled: ""})
    const template = Template.fromStack(getStack(composer))
    template.resourceCountIs("AWS::OpenSearchService::Domain", 1)
    template.hasResourceProperties("AWS::OpenSearchService::Domain", {
      EncryptionAtRestOptions: {Enabled: true}
    })
  })

  test('Test primary context options are mapped with standard data type', () => {
    const composer = createStackComposer({
      stage: "unittest",
      clusters: [{
        clusterId: "dev-search",
        clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
        clusterVersion: "OS_2.3",
        domainName: "test-os-domain",
        dataNodeType: "r6.large.search",
        dataNodeCount: 2,
        dedicatedManagerNodeType: "r6g.large.search",
        dedicatedManagerNodeCount: 2,
        warmNodeType: "ultrawarm1.medium.search",
        warmNodeCount: 2,
        accessPolicies: {
          "Version": "2012-10-17",
          "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": "arn:aws:iam::12345678912:user/test-user"},
            "Action": "es:ESHttp*",
            "Resource": "arn:aws:es:us-east-1:12345678912:domain/cdk-os-service-domain/*"
          }]
        },
        fineGrainedManagerUserARN: "arn:aws:iam::12345678912:user/test-user",
        enforceHTTPS: true,
        tlsSecurityPolicy: "TLS_1_2",
        ebsEnabled: true,
        ebsIops: 4000,
        ebsVolumeSize: 15,
        ebsVolumeType: "GP3",
        encryptionAtRestEnabled: true,
        encryptionAtRestKmsKeyARN: "arn:aws:kms:us-east-1:12345678912:key/abc123de-4888-4fa7-a508-3811e2d49fc3",
        loggingAppLogEnabled: true,
        loggingAppLogGroupARN: "arn:aws:logs:us-east-1:12345678912:log-group:test-log-group:*",
        nodeToNodeEncryptionEnabled: true,
        domainRemovalPolicy: "DESTROY",
      }]
    })
    assertPrimaryDomainTemplate(Template.fromStack(getStack(composer)))
  });

  test('Test primary context options are mapped with only string data type', () => {
    const composer = createStackComposer({
      stage: "unittest",
      clusters: [{
        clusterId: "dev-search",
        clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
        clusterVersion: "OS_2.3",
        domainName: "test-os-domain",
        dataNodeType: "r6.large.search",
        dataNodeCount: "2",
        dedicatedManagerNodeType: "r6g.large.search",
        dedicatedManagerNodeCount: "2",
        warmNodeType: "ultrawarm1.medium.search",
        warmNodeCount: "2",
        accessPolicies: "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"arn:aws:iam::12345678912:user/test-user\"},\"Action\":\"es:ESHttp*\",\"Resource\":\"arn:aws:es:us-east-1:12345678912:domain/cdk-os-service-domain/*\"}]}",
        fineGrainedManagerUserARN: "arn:aws:iam::12345678912:user/test-user",
        enforceHTTPS: "true",
        tlsSecurityPolicy: "TLS_1_2",
        ebsEnabled: "true",
        ebsIops: "4000",
        ebsVolumeSize: "15",
        ebsVolumeType: "GP3",
        encryptionAtRestEnabled: "true",
        encryptionAtRestKmsKeyARN: "arn:aws:kms:us-east-1:12345678912:key/abc123de-4888-4fa7-a508-3811e2d49fc3",
        loggingAppLogEnabled: "true",
        loggingAppLogGroupARN: "arn:aws:logs:us-east-1:12345678912:log-group:test-log-group:*",
        nodeToNodeEncryptionEnabled: "true",
        domainRemovalPolicy: "DESTROY",
      }]
    })
    assertPrimaryDomainTemplate(Template.fromStack(getStack(composer)))
  });

  test('Test alternate context options are mapped with standard data type', () => {
    const composer = createStackComposerWithSingleDomainContext({
      useUnsignedBasicAuth: true,
      fineGrainedManagerUserSecretARN: "arn:aws:secretsmanager:us-east-1:12345678912:secret:master-user-os-pass-123abc",
      enforceHTTPS: true, encryptionAtRestEnabled: true, nodeToNodeEncryptionEnabled: true,
    })
    assertAlternateDomainTemplate(Template.fromStack(getStack(composer)))
  })

  test('Test alternate context options are mapped with only string data type', () => {
    const composer = createStackComposerWithSingleDomainContext({
      useUnsignedBasicAuth: "true",
      fineGrainedManagerUserSecretARN: "arn:aws:secretsmanager:us-east-1:12345678912:secret:master-user-os-pass-123abc",
      enforceHTTPS: "true", encryptionAtRestEnabled: "true", nodeToNodeEncryptionEnabled: "true",
    })
    assertAlternateDomainTemplate(Template.fromStack(getStack(composer)))
  })

  test('Test openAccessPolicy creates access policy when enabled', () => {
    const composer = createStackComposerWithSingleDomainContext({openAccessPolicyEnabled: true})
    Template.fromStack(getStack(composer)).resourceCountIs("Custom::OpenSearchAccessPolicy", 1)
  })

  test('Test openAccessPolicy does not create access policy when disabled', () => {
    const composer = createStackComposerWithSingleDomainContext({openAccessPolicyEnabled: false})
    Template.fromStack(getStack(composer)).resourceCountIs("Custom::OpenSearchAccessPolicy", 0)
  })

  test('Test default stack is created when empty context options are provided', () => {
    const composer = createStackComposerWithSingleDomainContext({
      dataNodeType: "", dataNodeCount: "", dedicatedManagerNodeType: "",
      dedicatedManagerNodeCount: "", warmNodeType: "", warmNodeCount: "",
      accessPolicies: "", useUnsignedBasicAuth: "", fineGrainedManagerUserARN: "",
      enforceHTTPS: "", tlsSecurityPolicy: "", ebsEnabled: "", ebsIops: "",
      ebsVolumeSize: "", ebsVolumeType: "", encryptionAtRestEnabled: "",
      encryptionAtRestKmsKeyARN: "", loggingAppLogEnabled: "", loggingAppLogGroupARN: "",
      nodeToNodeEncryptionEnabled: "", clusterSubnetIds: "", clusterSecurityGroupIds: "",
      openAccessPolicyEnabled: "", domainRemovalPolicy: "",
    })
    Template.fromStack(getStack(composer)).resourceCountIs("AWS::OpenSearchService::Domain", 1)
  })

  test('Test ebsThroughput is set on EBS options', () => {
    const composer = createStackComposerWithSingleDomainContext({
      ebsEnabled: true, ebsVolumeType: "GP3", ebsVolumeSize: 100, ebsThroughput: 250,
    })
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchService::Domain", {
      EBSOptions: {EBSEnabled: true, VolumeSize: 100, VolumeType: "gp3", Throughput: 250}
    })
  })

  test('Test ebsIops and ebsThroughput are ignored for non-GP3 volume types', () => {
    const composer = createStackComposerWithSingleDomainContext({
      ebsEnabled: true, ebsVolumeType: "GP2", ebsVolumeSize: 100, ebsIops: 4000, ebsThroughput: 250,
    })
    const template = Template.fromStack(getStack(composer))
    template.hasResourceProperties("AWS::OpenSearchService::Domain", {
      EBSOptions: {EBSEnabled: true, VolumeSize: 100, VolumeType: "gp2"}
    })
    const resources = template.findResources("AWS::OpenSearchService::Domain")
    const ebsOptions = Object.values(resources)[0].Properties.EBSOptions
    expect(ebsOptions.Iops).toBeUndefined()
    expect(ebsOptions.Throughput).toBeUndefined()
  })

  test('Test VPC resources are created for managed clusters', () => {
    const composer = createStackComposer({
      clusters: [{clusterId: "test", clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE}]
    })
    const template = Template.fromStack(getStack(composer))
    template.resourceCountIs("AWS::EC2::VPC", 1)
    template.resourceCountIs("AWS::EC2::SecurityGroup", 1)
    template.resourceCountIs("AWS::EC2::Subnet", 4)
  })

  test('Test no VPC resources for serverless-only deployment', () => {
    const composer = createStackComposer({
      clusters: [{clusterId: "search", clusterType: ClusterType.OPENSEARCH_SERVERLESS}]
    })
    Template.fromStack(getStack(composer)).resourceCountIs("AWS::EC2::VPC", 0)
  })
})

function assertPrimaryDomainTemplate(template: Template) {
  template.resourceCountIs("Custom::OpenSearchAccessPolicy", 1)
  template.resourceCountIs("AWS::OpenSearchService::Domain", 1)
  template.hasResourceProperties("AWS::OpenSearchService::Domain", {
    EngineVersion: "OpenSearch_2.3",
    DomainName: "cluster-unittest-dev-search",
    AdvancedSecurityOptions: {
      Enabled: true,
      MasterUserOptions: {MasterUserARN: "arn:aws:iam::12345678912:user/test-user"}
    },
    ClusterConfig: {
      DedicatedMasterCount: 2, DedicatedMasterEnabled: true, DedicatedMasterType: "r6g.large.search",
      InstanceCount: 2, InstanceType: "r6.large.search",
      WarmCount: 2, WarmType: "ultrawarm1.medium.search",
      ZoneAwarenessConfig: {AvailabilityZoneCount: 2}, ZoneAwarenessEnabled: true
    },
    DomainEndpointOptions: {EnforceHTTPS: true, TLSSecurityPolicy: "Policy-Min-TLS-1-2-2019-07"},
    EBSOptions: {EBSEnabled: true, Iops: 4000, VolumeSize: 15, VolumeType: "gp3"},
    EncryptionAtRestOptions: {
      Enabled: true,
      KmsKeyId: "arn:aws:kms:us-east-1:12345678912:key/abc123de-4888-4fa7-a508-3811e2d49fc3"
    },
    LogPublishingOptions: {
      ES_APPLICATION_LOGS: {
        CloudWatchLogsLogGroupArn: "arn:aws:logs:us-east-1:12345678912:log-group:test-log-group:*",
        Enabled: true
      }
    },
    VPCOptions: {},
    NodeToNodeEncryptionOptions: {Enabled: true}
  })
  template.hasResource("AWS::OpenSearchService::Domain", {
    DeletionPolicy: "Delete", UpdateReplacePolicy: "Delete"
  })
}

function assertAlternateDomainTemplate(template: Template) {
    template.resourceCountIs("Custom::OpenSearchAccessPolicy", 1)
    template.resourceCountIs("AWS::OpenSearchService::Domain", 1)
    template.hasResourceProperties("AWS::OpenSearchService::Domain", {
        AdvancedSecurityOptions: {
            Enabled: true,
            MasterUserOptions: {
                MasterUserName: "{{resolve:secretsmanager:arn:aws:secretsmanager:us-east-1:12345678912:secret:master-user-os-pass-123abc:SecretString:username::}}",
                MasterUserPassword: "{{resolve:secretsmanager:arn:aws:secretsmanager:us-east-1:12345678912:secret:master-user-os-pass-123abc:SecretString:password::}}"
            }
        }
    })
}

describe('Cold Storage, Multi-AZ Standby, Off-Peak Window Tests', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test('Test cold storage enabled', () => {
    const composer = createStackComposerWithSingleDomainContext({
      coldStorageEnabled: true,
      warmNodeType: "ultrawarm1.medium.search",
      warmNodeCount: 2,
      dedicatedManagerNodeType: "r6g.large.search",
      dedicatedManagerNodeCount: 2,
    })
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchService::Domain", {
      ClusterConfig: {ColdStorageOptions: {Enabled: true}},
    })
  })

  test('Test multi-AZ with standby enabled', () => {
    const composer = createStackComposerWithSingleDomainContext({multiAZWithStandbyEnabled: true})
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchService::Domain", {
      ClusterConfig: {MultiAZWithStandbyEnabled: true},
    })
  })

  test('Test off-peak window enabled', () => {
    const composer = createStackComposerWithSingleDomainContext({offPeakWindowEnabled: true})
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchService::Domain", {
      OffPeakWindowOptions: {Enabled: true},
    })
  })

  test('Test SAML authentication', () => {
    const composer = createStackComposerWithSingleDomainContext({
      fineGrainedManagerUserARN: "arn:aws:iam::123456789012:user/admin",
      samlEntityId: "https://idp.example.com",
      samlMetadataContent: "<xml>metadata</xml>",
      samlMasterUserName: "admin",
      samlRolesKey: "Role",
      samlSessionTimeoutMinutes: 120,
    })
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchService::Domain", {
      AdvancedSecurityOptions: {
        SAMLOptions: {
          Enabled: true,
          Idp: {
            EntityId: "https://idp.example.com",
            MetadataContent: "<xml>metadata</xml>",
          },
          MasterUserName: "admin",
          RolesKey: "Role",
          SessionTimeoutMinutes: 120,
        },
      },
    })
  })
})
