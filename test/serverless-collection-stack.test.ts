import { Template } from "aws-cdk-lib/assertions";
import { ServerlessCollectionStack } from "../lib/serverless-collection-stack";
import { createStackComposer } from "./test-utils";
import { describe, afterEach, test, expect, jest } from '@jest/globals';
import { ClusterType } from "../lib/components/common-utilities";
import { NetworkStack } from "../lib/network-stack";

describe('Serverless Collection Stack Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('Test serverless collection is created with default options', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "search",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        }
      ]
    }

    const stackComposer = createStackComposer(contextOptions)

    const serverlessStack = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)[0]
    const template = Template.fromStack(serverlessStack)
    template.resourceCountIs("AWS::OpenSearchServerless::Collection", 1)
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Name: "cluster-unit-test-search",
      Type: "SEARCH",
      StandbyReplicas: "ENABLED",
    })
    // Encryption + network security policies
    template.resourceCountIs("AWS::OpenSearchServerless::SecurityPolicy", 2)
    // Data access policy
    template.resourceCountIs("AWS::OpenSearchServerless::AccessPolicy", 1)
  })

  test('Test serverless collection with TIMESERIES type', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "logs",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
          collectionType: "TIMESERIES",
        }
      ]
    }

    const stackComposer = createStackComposer(contextOptions)

    const serverlessStack = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)[0]
    const template = Template.fromStack(serverlessStack)
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Type: "TIMESERIES",
    })
  })

  test('Test serverless collection with VECTORSEARCH type', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "vectors",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
          collectionType: "VECTORSEARCH",
        }
      ]
    }

    const stackComposer = createStackComposer(contextOptions)

    const serverlessStack = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)[0]
    const template = Template.fromStack(serverlessStack)
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      Type: "VECTORSEARCH",
    })
  })

  test('Test serverless collection with standby replicas disabled', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "dev",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
          standbyReplicas: "DISABLED",
        }
      ]
    }

    const stackComposer = createStackComposer(contextOptions)

    const serverlessStack = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)[0]
    const template = Template.fromStack(serverlessStack)
    template.hasResourceProperties("AWS::OpenSearchServerless::Collection", {
      StandbyReplicas: "DISABLED",
    })
  })

  test('Test invalid collection type throws error', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "bad",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
          collectionType: "INVALID",
        }
      ]
    }

    expect(() => createStackComposer(contextOptions)).toThrow(/Invalid 'collectionType'/)
  })

  test('Test invalid standby replicas value throws error', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "bad",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
          standbyReplicas: "MAYBE",
        }
      ]
    }

    expect(() => createStackComposer(contextOptions)).toThrow(/Invalid 'standbyReplicas'/)
  })

  test('Test serverless cluster does not create NetworkStack when no VPC needed', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "search",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        }
      ]
    }

    const stackComposer = createStackComposer(contextOptions)

    // NetworkStack is still created by default (for potential managed clusters)
    // but serverless stack doesn't depend on it
    const serverlessStacks = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)
    expect(serverlessStacks.length).toBe(1)
  })

  test('Test mixed managed + serverless clusters', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "managed",
          clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
        },
        {
          clusterId: "serverless",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        }
      ]
    }

    const stackComposer = createStackComposer(contextOptions)

    const networkStacks = stackComposer.stacks.filter((s) => s instanceof NetworkStack)
    const serverlessStacks = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)
    expect(networkStacks.length).toBe(1)
    expect(serverlessStacks.length).toBe(1)
  })

  test('Test OPENSEARCH_SERVERLESS cluster type is parsed correctly', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "test",
          clusterType: "OPENSEARCH_SERVERLESS",
        }
      ]
    }

    const stackComposer = createStackComposer(contextOptions)

    const serverlessStacks = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)
    expect(serverlessStacks.length).toBe(1)
  })

  test('Test serverless collection with DESTROY removal policy', () => {
    const contextOptions = {
      clusters: [
        {
          clusterId: "ephemeral",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
          domainRemovalPolicy: "DESTROY",
        }
      ]
    }

    const stackComposer = createStackComposer(contextOptions)

    const serverlessStack = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)[0]
    const template = Template.fromStack(serverlessStack)
    template.hasResource("AWS::OpenSearchServerless::Collection", {
      DeletionPolicy: "Delete",
    })
  })

  test('VPC endpoint restricts network policy when vpcEndpointId is set', () => {
    const contextOptions = {
      clusters: [{
        clusterId: "vpce",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        vpcEndpointId: "vpce-0123456789abcdef0",
      }]
    }

    const stackComposer = createStackComposer(contextOptions)
    const serverlessStack = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)[0]
    const template = Template.fromStack(serverlessStack)

    // Network policy should have AllowFromPublic: false and SourceVPCEs
    template.hasResourceProperties("AWS::OpenSearchServerless::SecurityPolicy", {
      Type: "network",
    })
  })

  test('public access when no vpcEndpointId', () => {
    const contextOptions = {
      clusters: [{
        clusterId: "public",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
      }]
    }

    const stackComposer = createStackComposer(contextOptions)
    const serverlessStack = stackComposer.stacks.filter((s) => s instanceof ServerlessCollectionStack)[0]
    const template = Template.fromStack(serverlessStack)

    template.hasResourceProperties("AWS::OpenSearchServerless::SecurityPolicy", {
      Type: "network",
    })
  })
})
