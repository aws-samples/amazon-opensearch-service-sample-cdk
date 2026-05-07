import { Template } from "aws-cdk-lib/assertions";
import {createStackComposer, createStackComposerWithSingleDomainContext, getStack} from "./test-utils";
import { describe, afterEach, test, expect, vi } from 'vitest';
import {ClusterType} from "../lib/components/common-utilities";
import {OpenSearchStack} from "../lib/opensearch-stack";

describe('Stack Composer Tests', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test('Test invalid engine version format throws error', () => {
    expect(() => createStackComposerWithSingleDomainContext({clusterVersion: "OpenSearch_1.3"})).toThrow()
  })

  test('Test ES_7.10 engine version format is parsed', () => {
    const composer = createStackComposerWithSingleDomainContext({clusterVersion: "ES_7.10"})
    const template = Template.fromStack(getStack(composer))
    template.resourceCountIs("AWS::OpenSearchService::Domain", 1)
  })

  test('Test OS 1.3 engine version format is parsed', () => {
    const composer = createStackComposerWithSingleDomainContext({clusterVersion: "OS_1.3"})
    const template = Template.fromStack(getStack(composer))
    template.resourceCountIs("AWS::OpenSearchService::Domain", 1)
  })

  test('Test access policy is parsed for proper array format', () => {
    const composer = createStackComposerWithSingleDomainContext({
      accessPolicies: {
        "Version": "2012-10-17",
        "Statement": [
          {"Effect": "Allow", "Principal": {"AWS": "arn:aws:iam::12345678912:user/test-user"}, "Action": "es:ESHttp*", "Resource": "arn:aws:es:us-east-1:12345678912:domain/test-os-domain/*"},
          {"Effect": "Allow", "Principal": {"AWS": "arn:aws:iam::12345678912:user/test-user2"}, "Action": "es:ESHttp*", "Resource": "arn:aws:es:us-east-1:12345678912:domain/test-os-domain/*"}
        ]
      }
    })
    Template.fromStack(getStack(composer)).resourceCountIs("Custom::OpenSearchAccessPolicy", 1)
  })

  test('Test access policy is parsed for proper block format', () => {
    const composer = createStackComposerWithSingleDomainContext({
      accessPolicies: {
        "Version": "2012-10-17",
        "Statement": {"Effect": "Allow", "Principal": {"AWS": "*"}, "Action": "es:ESHttp*", "Resource": "arn:aws:es:us-east-1:12345678912:domain/test-os-domain/*"}
      }
    })
    Template.fromStack(getStack(composer)).resourceCountIs("Custom::OpenSearchAccessPolicy", 1)
  })

  test('Test access policy missing Statement throws error', () => {
    expect(() => createStackComposerWithSingleDomainContext({accessPolicies: {"Version": "2012-10-17"}})).toThrow()
  })

  test('Test access policy with empty Statement array throws error', () => {
    expect(() => createStackComposerWithSingleDomainContext({accessPolicies: {"Version": "2012-10-17", "Statement": []}})).toThrow()
  })

  test('Test access policy with empty Statement block throws error', () => {
    expect(() => createStackComposerWithSingleDomainContext({accessPolicies: {"Version": "2012-10-17", "Statement": {}}})).toThrow()
  })

  test('Test access policy with improper Statement throws error', () => {
    expect(() => createStackComposerWithSingleDomainContext({accessPolicies: {"Version": "2012-10-17", "Statement": [{"Effect": "Allow"}]}})).toThrow()
  })

  test('Test invalid TLS security policy throws error', () => {
    expect(() => createStackComposerWithSingleDomainContext({tlsSecurityPolicy: "TLS_0_9"})).toThrow()
  })

  test('Test invalid EBS volume type throws error', () => {
    expect(() => createStackComposerWithSingleDomainContext({ebsVolumeType: "GP0"})).toThrow()
  })

  test('Test invalid domain removal policy type throws error', () => {
    expect(() => createStackComposerWithSingleDomainContext({domainRemovalPolicy: "DELETE"})).toThrow()
  })

  test('Test that loading context via a file is successful', () => {
    const composer = createStackComposer({contextFile: './test/resources/sample-context-file.json'})
    expect(composer.stacks.length).toBe(1)
    Template.fromStack(getStack(composer)).resourceCountIs("AWS::EC2::VPC", 1)
  })

  test('Test that loading context via a file errors if file does not exist', () => {
    expect(() => createStackComposer({contextFile: './test/resources/missing-file.json'})).toThrow()
  })

  test('Test that loading context via a file errors if file is not proper json', () => {
    expect(() => createStackComposer({contextFile: './test/resources/invalid-context-file.json'})).toThrow()
  })

  test('Test single stack is created for all deployment types', () => {
    const composer = createStackComposer({
      clusters: [
        {clusterId: "managed", clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE},
        {clusterId: "aoss", clusterType: ClusterType.OPENSEARCH_SERVERLESS},
      ]
    })
    expect(composer.stacks.length).toBe(1)
    expect(composer.stacks[0]).toBeInstanceOf(OpenSearchStack)
  })

  test('Test auto-tags and custom tags are applied', () => {
    const composer = createStackComposer({
      tags: {CostCenter: '12345', Team: 'search-platform'},
      clusters: [{clusterId: "tagged", clusterType: ClusterType.OPENSEARCH_SERVERLESS}]
    })
    expect(composer.stacks.length).toBe(1)
    const template = Template.fromStack(getStack(composer))
    const collections = template.findResources('AWS::OpenSearchServerless::Collection')
    const collection = Object.values(collections)[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tags = (collection as any).Properties.Tags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tagMap = Object.fromEntries(tags.map((t: any) => [t.Key, t.Value]))
    expect(tagMap['Environment']).toBe('unit-test')
    expect(tagMap['ManagedBy']).toBe('CDK')
    expect(tagMap['Project']).toBe('opensearch-sample')
    expect(tagMap['CostCenter']).toBe('12345')
    expect(tagMap['Team']).toBe('search-platform')
  })

  test('Test default clusterName overflow for managed domain produces stage-aware error', () => {
    // stage under MAX_STAGE_NAME_LENGTH (15) but default pattern 'cluster-<stage>-source'
    // exceeds the 28-char managed domain limit: cluster-(8) + stage(14) + '-'(1) + 'source'(6) = 29.
    expect(() => createStackComposer({
      stage: "fourteen-chars",
      clusters: [{clusterId: "source", clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE}]
    })).toThrow(/'stage' must be at most 13 characters/)
  })

  test('Test default clusterName overflow for serverless produces stage-aware error', () => {
    // cluster-(8) + stage(11) + '-'(1) + target(6) = 26 chars,
    // but with '-access' suffix for AOSS policy = 33 chars → exceeds 32-char policy limit.
    expect(() => createStackComposer({
      stage: "eleven-char",
      clusters: [{clusterId: "target", clusterType: ClusterType.OPENSEARCH_SERVERLESS}]
    })).toThrow(/AOSS policy name.*'stage' must be at most 10 characters/s)
  })

  test('Test default clusterName that fits the limit is accepted', () => {
    // cluster-(8) + stage(13) + '-'(1) + source(6) = 28 chars exactly — at the managed limit.
    const composer = createStackComposer({
      stage: "thirteen-chrs",
      clusters: [{clusterId: "source", clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE}]
    })
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchService::Domain", {
      DomainName: "cluster-thirteen-chrs-source",
    })
  })
})
