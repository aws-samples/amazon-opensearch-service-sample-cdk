import { NetworkStack } from "../lib/network-stack";
import { Template } from "aws-cdk-lib/assertions";
import { createStackComposer } from "./test-utils";
import { describe, test, expect } from '@jest/globals';

describe('NetworkStack Tests', () => {

    test('Test default VPC resources get created with no VPC settings', () => {
        const contextOptions = {}

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

});
