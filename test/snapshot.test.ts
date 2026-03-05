import { Template } from "aws-cdk-lib/assertions";
import { createStackComposer } from "./test-utils";
import { describe, test, expect } from '@jest/globals';
import { NetworkStack } from "../lib/network-stack";
import { OpenSearchDomainStack } from "../lib/opensearch-domain-stack";
import { ServerlessCollectionStack } from "../lib/serverless-collection-stack";
import { ClusterType } from "../lib/components/common-utilities";

describe('Snapshot Tests', () => {

  test('NetworkStack template snapshot', () => {
    const stackComposer = createStackComposer({
      clusters: [{
        clusterId: "snap",
        clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
      }]
    });
    const networkStack = stackComposer.stacks.find(s => s instanceof NetworkStack);
    expect(networkStack).toBeDefined();
    expect(Template.fromStack(networkStack as NetworkStack).toJSON()).toMatchSnapshot();
  });

  test('OpenSearchDomainStack template snapshot', () => {
    const stackComposer = createStackComposer({
      clusters: [{
        clusterId: "snap",
        clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
        dataNodeType: "r6g.large.search",
        dataNodeCount: 2,
        ebsEnabled: true,
        ebsVolumeSize: 100,
        ebsVolumeType: "GP3",
        nodeToNodeEncryptionEnabled: true,
        enforceHTTPS: true,
      }]
    });
    const domainStack = stackComposer.stacks.find(s => s instanceof OpenSearchDomainStack);
    expect(domainStack).toBeDefined();
    expect(Template.fromStack(domainStack as OpenSearchDomainStack).toJSON()).toMatchSnapshot();
  });

  test('ServerlessCollectionStack template snapshot', () => {
    const stackComposer = createStackComposer({
      clusters: [{
        clusterId: "snap",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        collectionType: "SEARCH",
        standbyReplicas: "DISABLED",
        domainRemovalPolicy: "DESTROY",
      }]
    });
    const serverlessStack = stackComposer.stacks.find(s => s instanceof ServerlessCollectionStack);
    expect(serverlessStack).toBeDefined();
    expect(Template.fromStack(serverlessStack as ServerlessCollectionStack).toJSON()).toMatchSnapshot();
  });

});
