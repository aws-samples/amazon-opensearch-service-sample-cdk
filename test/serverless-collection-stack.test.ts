import { Template } from "aws-cdk-lib/assertions";
import { createStackComposer, getStack } from "./test-utils";
import { describe, afterEach, test, expect, vi } from 'vitest';
import { ClusterType } from "../lib/components/common-utilities";

describe('Serverless Collection Tests', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test('Test serverless collection is created with default options', () => {
    const composer = createStackComposer({
      clusters: [{clusterId: "search", clusterType: ClusterType.OPENSEARCH_SERVERLESS}]
    })
    const template = Template.fromStack(getStack(composer))
    template.resourceCountIs("AWS::OpenSearchServerless::Collection", 1)
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Name: "cluster-unit-test-search", Type: "SEARCH", StandbyReplicas: "ENABLED",
    })
    template.resourceCountIs("AWS::OpenSearchServerless::SecurityPolicy", 2)
    template.resourceCountIs("AWS::OpenSearchServerless::AccessPolicy", 1)
  })

  test('Test serverless collection with TIMESERIES type', () => {
    const composer = createStackComposer({
      clusters: [{clusterId: "logs", clusterType: ClusterType.OPENSEARCH_SERVERLESS, collectionType: "TIMESERIES"}]
    })
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchServerless::Collection", {Type: "TIMESERIES"})
  })

  test('Test serverless collection with VECTORSEARCH type', () => {
    const composer = createStackComposer({
      clusters: [{clusterId: "vectors", clusterType: ClusterType.OPENSEARCH_SERVERLESS, collectionType: "VECTORSEARCH"}]
    })
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchServerless::Collection", {Type: "VECTORSEARCH"})
  })

  test('Test serverless collection with standby replicas disabled', () => {
    const composer = createStackComposer({
      clusters: [{clusterId: "dev", clusterType: ClusterType.OPENSEARCH_SERVERLESS, standbyReplicas: "DISABLED"}]
    })
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchServerless::Collection", {StandbyReplicas: "DISABLED"})
  })

  test('Test invalid collection type throws error', () => {
    expect(() => createStackComposer({
      clusters: [{clusterId: "bad", clusterType: ClusterType.OPENSEARCH_SERVERLESS, collectionType: "INVALID"}]
    })).toThrow(/Invalid 'collectionType'/)
  })

  test('Test invalid standby replicas value throws error', () => {
    expect(() => createStackComposer({
      clusters: [{clusterId: "bad", clusterType: ClusterType.OPENSEARCH_SERVERLESS, standbyReplicas: "MAYBE"}]
    })).toThrow(/Invalid 'standbyReplicas'/)
  })

  test('Test serverless collection with DESTROY removal policy', () => {
    const composer = createStackComposer({
      clusters: [{clusterId: "ephemeral", clusterType: ClusterType.OPENSEARCH_SERVERLESS, domainRemovalPolicy: "DESTROY"}]
    })
    Template.fromStack(getStack(composer)).hasResource("AWS::OpenSearchServerless::Collection", {DeletionPolicy: "Delete"})
  })

  test('VPC endpoint restricts network policy when vpcEndpointId is set', () => {
    const composer = createStackComposer({
      clusters: [{clusterId: "vpce", clusterType: ClusterType.OPENSEARCH_SERVERLESS, vpcEndpointId: "vpce-0123456789abcdef0"}]
    })
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchServerless::SecurityPolicy", {Type: "network"})
  })

  test('public access when no vpcEndpointId', () => {
    const composer = createStackComposer({
      clusters: [{clusterId: "public", clusterType: ClusterType.OPENSEARCH_SERVERLESS}]
    })
    Template.fromStack(getStack(composer)).hasResourceProperties("AWS::OpenSearchServerless::SecurityPolicy", {Type: "network"})
  })

  test('Test mixed managed + serverless in single stack', () => {
    const composer = createStackComposer({
      clusters: [
        {clusterId: "managed", clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE},
        {clusterId: "serverless", clusterType: ClusterType.OPENSEARCH_SERVERLESS},
      ]
    })
    expect(composer.stacks.length).toBe(1)
    const template = Template.fromStack(getStack(composer))
    template.resourceCountIs("AWS::OpenSearchServerless::Collection", 1)
    template.resourceCountIs("AWS::EC2::VPC", 1)
  })

  test('Test collection group creates multiple collections with shared policies', () => {
    const composer = createStackComposer({
      clusters: [{
        clusterId: "group",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        collections: [
          {collectionName: "logs", collectionType: "TIMESERIES"},
          {collectionName: "search-data", collectionType: "SEARCH"},
        ]
      }]
    })
    const template = Template.fromStack(getStack(composer))
    template.resourceCountIs("AWS::OpenSearchServerless::Collection", 2)
    // Shared policies: 1 encryption + 1 network
    template.resourceCountIs("AWS::OpenSearchServerless::SecurityPolicy", 2)
    // 1 shared data access policy
    template.resourceCountIs("AWS::OpenSearchServerless::AccessPolicy", 1)
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Name: "logs", Type: "TIMESERIES",
    })
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Name: "search-data", Type: "SEARCH",
    })
  })

  test('Test collection group inherits cluster-level collectionType', () => {
    const composer = createStackComposer({
      clusters: [{
        clusterId: "group",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        collectionType: "VECTORSEARCH",
        collections: [
          {collectionName: "vectors-a"},
          {collectionName: "vectors-b"},
        ]
      }]
    })
    const template = Template.fromStack(getStack(composer))
    template.resourceCountIs("AWS::OpenSearchServerless::Collection", 2)
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Name: "vectors-a", Type: "VECTORSEARCH",
    })
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Name: "vectors-b", Type: "VECTORSEARCH",
    })
  })

  test('Test collection entry overrides cluster-level collectionType', () => {
    const composer = createStackComposer({
      clusters: [{
        clusterId: "mixed",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        collectionType: "SEARCH",
        collections: [
          {collectionName: "default-type"},
          {collectionName: "timeseries-one", collectionType: "TIMESERIES"},
        ]
      }]
    })
    const template = Template.fromStack(getStack(composer))
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Name: "default-type", Type: "SEARCH",
    })
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Name: "timeseries-one", Type: "TIMESERIES",
    })
  })

  test('Test collection group missing collectionName throws error', () => {
    expect(() => createStackComposer({
      clusters: [{
        clusterId: "bad",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        collections: [{collectionType: "SEARCH"}]
      }]
    })).toThrow(/collectionName/)
  })

  test('Test custom dataAccessPrincipals', () => {
    const composer = createStackComposer({
      clusters: [{
        clusterId: "scoped",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        dataAccessPrincipals: [
          "arn:aws:iam::123456789012:role/MyRole",
          "arn:aws:iam::123456789012:role/OtherRole",
        ]
      }]
    })
    const template = Template.fromStack(getStack(composer))
    template.hasResourceProperties("AWS::OpenSearchServerless::AccessPolicy", {
      Type: "data",
    })
  })
})
