import { NetworkStack } from "../lib/network-stack";
import { Template } from "aws-cdk-lib/assertions";
import { createStackComposer } from "./test-utils";
import { describe, test, expect } from '@jest/globals';
import { ClusterType } from "../lib/components/common-utilities";

describe('NetworkStack Tests', () => {

    test('Test default VPC resources get created with a managed cluster', () => {
        const contextOptions = {
            clusters: [
                {
                    clusterId: "test",
                    clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
                }
            ]
        }

        const openSearchStacks = createStackComposer(contextOptions)

        const networkStack: NetworkStack = (openSearchStacks.stacks.filter((s) => s instanceof NetworkStack)[0]) as NetworkStack
        const networkTemplate = Template.fromStack(networkStack)

        networkTemplate.resourceCountIs("AWS::EC2::VPC", 1)
        networkTemplate.resourceCountIs("AWS::EC2::SecurityGroup", 1)
        // For each AZ, a private and public subnet is created
        networkTemplate.resourceCountIs("AWS::EC2::Subnet", 4)

        const vpc = networkStack.vpc
        expect(vpc.publicSubnets.length).toBe(2)
        expect(vpc.privateSubnets.length).toBe(2)
    });

    test('Test no NetworkStack created when no clusters defined', () => {
        const contextOptions = {}

        const openSearchStacks = createStackComposer(contextOptions)

        const networkStacks = openSearchStacks.stacks.filter((s) => s instanceof NetworkStack)
        expect(networkStacks.length).toBe(0)
    });

});
