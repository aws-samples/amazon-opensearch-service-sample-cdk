import { Template } from "aws-cdk-lib/assertions";
import { OpenSearchDomainStack } from "../lib/opensearch-domain-stack";
import {createStackComposer, createStackComposerWithSingleDomainContext} from "./test-utils";
import { describe, afterEach, test, expect, jest } from '@jest/globals';
import {NetworkStack} from "../lib/network-stack";
import {ClusterType} from "../lib/components/common-utilities";

describe('Stack Composer Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('Test invalid engine version format throws error', () => {
    const contextOptions = {
      // Should be OS_1.3
      clusterVersion: "OpenSearch_1.3"
    }

    const createStackFunc = () => createStackComposerWithSingleDomainContext(contextOptions)

    expect(createStackFunc).toThrow()
  })

  test('Test ES_7.10 engine version format is parsed', () => {
    const contextOptions = {
      clusterVersion: "ES_7.10",
    }

    const openSearchStacks = createStackComposerWithSingleDomainContext(contextOptions)

    const domainStack = openSearchStacks.stacks.filter((s) => s instanceof OpenSearchDomainStack)[0]
    const domainTemplate = Template.fromStack(domainStack)
    domainTemplate.resourceCountIs("AWS::OpenSearchService::Domain", 1)
  })

  test('Test OS 1.3 engine version format is parsed', () => {
    const contextOptions = {
      clusterVersion: "OS_1.3",
    }

    const openSearchStacks = createStackComposerWithSingleDomainContext(contextOptions)

    const domainStack = openSearchStacks.stacks.filter((s) => s instanceof OpenSearchDomainStack)[0]
    const domainTemplate = Template.fromStack(domainStack)
    domainTemplate.resourceCountIs("AWS::OpenSearchService::Domain", 1)
  })

  test('Test access policy is parsed for proper array format', () => {
    const contextOptions = {
      accessPolicies:
        {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Principal": {"AWS": "arn:aws:iam::12345678912:user/test-user"},
              "Action": "es:ESHttp*",
              "Resource": "arn:aws:es:us-east-1:12345678912:domain/test-os-domain/*"
            },
            {
              "Effect": "Allow",
              "Principal": {"AWS": "arn:aws:iam::12345678912:user/test-user2"},
              "Action": "es:ESHttp*",
              "Resource": "arn:aws:es:us-east-1:12345678912:domain/test-os-domain/*"
            }]
        }
    }

    const openSearchStacks = createStackComposerWithSingleDomainContext(contextOptions)

    const domainStack = openSearchStacks.stacks.filter((s) => s instanceof OpenSearchDomainStack)[0]
    const domainTemplate = Template.fromStack(domainStack)
    // Check that accessPolicies policy is created
    domainTemplate.resourceCountIs("Custom::OpenSearchAccessPolicy", 1)
  })

  test('Test access policy is parsed for proper block format', () => {
    const contextOptions = {
      accessPolicies:
        {
          "Version": "2012-10-17",
          "Statement": {
            "Effect": "Allow",
            "Principal": {"AWS": "*"},
            "Action": "es:ESHttp*",
            "Resource": "arn:aws:es:us-east-1:12345678912:domain/test-os-domain/*"
          }
        }
    }

    const openSearchStacks = createStackComposerWithSingleDomainContext(contextOptions)

    const domainStack = openSearchStacks.stacks.filter((s) => s instanceof OpenSearchDomainStack)[0]
    const domainTemplate = Template.fromStack(domainStack)
    // Check that accessPolicies policy is created
    domainTemplate.resourceCountIs("Custom::OpenSearchAccessPolicy", 1)
  })

  test('Test access policy missing Statement throws error', () => {
    const contextOptions = {
      accessPolicies: {"Version": "2012-10-17"}
    }

    const createStackFunc = () => createStackComposerWithSingleDomainContext(contextOptions)

    expect(createStackFunc).toThrow()
  })

  test('Test access policy with empty Statement array throws error', () => {
    const contextOptions = {
      accessPolicies: {"Version": "2012-10-17", "Statement": []}
    }

    const createStackFunc = () => createStackComposerWithSingleDomainContext(contextOptions)

    expect(createStackFunc).toThrow()
  })

  test('Test access policy with empty Statement block throws error', () => {
    const contextOptions = {
      accessPolicies: {"Version": "2012-10-17", "Statement": {}}
    }

    const createStackFunc = () => createStackComposerWithSingleDomainContext(contextOptions)

    expect(createStackFunc).toThrow()
  })

  test('Test access policy with improper Statement throws error', () => {
    const contextOptions = {
      // Missing required fields in Statement
      accessPolicies: {"Version": "2012-10-17", "Statement": [{"Effect": "Allow"}]}
    }

    const createStackFunc = () => createStackComposerWithSingleDomainContext(contextOptions)

    expect(createStackFunc).toThrow()
  })

  test('Test invalid TLS security policy throws error', () => {
    const contextOptions = {
      tlsSecurityPolicy: "TLS_0_9"
    }

    const createStackFunc = () => createStackComposerWithSingleDomainContext(contextOptions)

    expect(createStackFunc).toThrow()
  })

  test('Test invalid EBS volume type throws error', () => {
    const contextOptions = {
      ebsVolumeType: "GP0",
    }

    const createStackFunc = () => createStackComposerWithSingleDomainContext(contextOptions)

    expect(createStackFunc).toThrow()
  })

  test('Test invalid domain removal policy type throws error', () => {
    const contextOptions = {
      domainRemovalPolicy: "DELETE",
    }

    const createStackFunc = () => createStackComposerWithSingleDomainContext(contextOptions)

    expect(createStackFunc).toThrow()
  })


  test('Test that loading context via a file is successful', () => {
    const contextOptions = {
      contextFile: './test/resources/sample-context-file.json',
    }
    const stacks = createStackComposer(contextOptions)
    const networkStack = stacks.stacks.filter((s) => s instanceof NetworkStack)
    expect(networkStack.length).toEqual(1)
  })

  test('Test that loading context via a file errors if file does not exist', () => {
    const contextOptions = {
      contextFile: './test/resources/missing-file.json',
    }

    const createStackFunc = () => createStackComposer(contextOptions)

    expect(createStackFunc).toThrow()
  })

  test('Test that loading context via a file errors if file is not proper json', () => {
    const contextOptions = {
      contextFile: './test/resources/invalid-context-file.json',
    }

    const createStackFunc = () => createStackComposer(contextOptions)

    expect(createStackFunc).toThrow()
  })

  test('Test importing VPC does not create a Network Stack', () => {
    const contextOptions = {
      vpcId: "vpc-345ljlsfkj232423",
      clusters: [
        {
          clusterId: "unittest",
          clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE
        }
      ]
    }

    const stackComposer = createStackComposer(contextOptions)

    const networkStacks = stackComposer.stacks.filter((s) => s instanceof NetworkStack)
    expect(networkStacks.length).toBe(0)
  })

})
