import { Template } from "aws-cdk-lib/assertions";
import { createStackComposer, getStack } from "./test-utils";
import { describe, test, expect } from 'vitest';
import { ClusterType } from "../lib/components/common-utilities";

describe('Snapshot Tests', () => {

  test('Managed domain stack template snapshot', () => {
    const composer = createStackComposer({
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
    expect(Template.fromStack(getStack(composer)).toJSON()).toMatchSnapshot();
  });

  test('Serverless collection stack template snapshot', () => {
    const composer = createStackComposer({
      clusters: [{
        clusterId: "snap",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
        collectionType: "SEARCH",
        standbyReplicas: "DISABLED",
        domainRemovalPolicy: "DESTROY",
      }]
    });
    expect(Template.fromStack(getStack(composer)).toJSON()).toMatchSnapshot();
  });

  test('Mixed managed + serverless stack template snapshot', () => {
    const composer = createStackComposer({
      clusters: [
        {
          clusterId: "domain",
          clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
          dataNodeType: "r6g.large.search",
          dataNodeCount: 2,
          ebsEnabled: true,
          ebsVolumeSize: 100,
          ebsVolumeType: "GP3",
        },
        {
          clusterId: "search",
          clusterType: ClusterType.OPENSEARCH_SERVERLESS,
          collectionType: "SEARCH",
          standbyReplicas: "DISABLED",
        },
      ]
    });
    expect(Template.fromStack(getStack(composer)).toJSON()).toMatchSnapshot();
  });

});
