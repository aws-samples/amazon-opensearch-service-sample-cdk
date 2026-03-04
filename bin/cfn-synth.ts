#!/usr/bin/env node
/**
 * Synthesizes standalone CloudFormation templates with CfnParameters.
 * These templates can be deployed directly via the AWS Console or CLI
 * without requiring CDK.
 *
 * Produces two stacks:
 *   - NetworkStack: VPC, subnets, security group
 *   - OpenSearchDomainStack: Managed OpenSearch Service domain
 *
 * Usage:
 *   npx cdk synth --app "npx ts-node bin/cfn-synth.ts" --no-staging -o cfn.out
 */
import 'source-map-support/register';
import {
    App, CfnCondition, CfnOutput, CfnParameter, Fn, Stack, StackProps,
} from 'aws-cdk-lib';
import {
    CfnInternetGateway, CfnNatGateway, CfnRoute, CfnRouteTable,
    CfnSecurityGroup, CfnSecurityGroupIngress, CfnSubnet,
    CfnSubnetRouteTableAssociation, CfnVPC, CfnVPCGatewayAttachment,
    CfnEIP,
} from 'aws-cdk-lib/aws-ec2';
import {CfnDomain} from 'aws-cdk-lib/aws-opensearchservice';
import {Construct} from 'constructs';

// ─── Network Stack (L1 — fully parameterized) ───────────────────────────────

class CfnNetworkStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, {
            ...props,
            description: 'VPC networking for OpenSearch Service (deploy via CloudFormation)',
        });

        const stage = new CfnParameter(this, 'Stage', {
            type: 'String', default: 'dev',
            description: 'Environment stage name (max 15 chars)',
            maxLength: 15,
        });

        const vpcCidr = new CfnParameter(this, 'VpcCidr', {
            type: 'String', default: '10.212.0.0/16',
            description: 'CIDR block for the VPC',
        });

        const publicSubnet1Cidr = new CfnParameter(this, 'PublicSubnet1Cidr', {
            type: 'String', default: '10.212.0.0/18',
            description: 'CIDR for public subnet 1',
        });

        const publicSubnet2Cidr = new CfnParameter(this, 'PublicSubnet2Cidr', {
            type: 'String', default: '10.212.64.0/18',
            description: 'CIDR for public subnet 2',
        });

        const privateSubnet1Cidr = new CfnParameter(this, 'PrivateSubnet1Cidr', {
            type: 'String', default: '10.212.128.0/18',
            description: 'CIDR for private subnet 1',
        });

        const privateSubnet2Cidr = new CfnParameter(this, 'PrivateSubnet2Cidr', {
            type: 'String', default: '10.212.192.0/18',
            description: 'CIDR for private subnet 2',
        });

        // VPC
        const vpc = new CfnVPC(this, 'Vpc', {
            cidrBlock: vpcCidr.valueAsString,
            enableDnsHostnames: true,
            enableDnsSupport: true,
            tags: [{key: 'Name', value: `vpc-${stage.valueAsString}`}],
        });

        // Internet Gateway
        const igw = new CfnInternetGateway(this, 'IGW', {});
        new CfnVPCGatewayAttachment(this, 'IGWAttach', {
            vpcId: vpc.ref,
            internetGatewayId: igw.ref,
        });

        // Public subnets
        const azs = [Fn.select(0, Fn.getAzs('')), Fn.select(1, Fn.getAzs(''))];

        const pubSub1 = new CfnSubnet(this, 'PublicSubnet1', {
            vpcId: vpc.ref, cidrBlock: publicSubnet1Cidr.valueAsString,
            availabilityZone: azs[0], mapPublicIpOnLaunch: true,
            tags: [{key: 'Name', value: `vpc-public-subnet-1-${stage.valueAsString}`}],
        });
        const pubSub2 = new CfnSubnet(this, 'PublicSubnet2', {
            vpcId: vpc.ref, cidrBlock: publicSubnet2Cidr.valueAsString,
            availabilityZone: azs[1], mapPublicIpOnLaunch: true,
            tags: [{key: 'Name', value: `vpc-public-subnet-2-${stage.valueAsString}`}],
        });

        // Public route table
        const pubRT = new CfnRouteTable(this, 'PublicRT', {
            vpcId: vpc.ref,
            tags: [{key: 'Name', value: `public-rt-${stage.valueAsString}`}],
        });
        new CfnRoute(this, 'PublicRoute', {
            routeTableId: pubRT.ref,
            destinationCidrBlock: '0.0.0.0/0',
            gatewayId: igw.ref,
        });
        new CfnSubnetRouteTableAssociation(this, 'PubRTAssoc1', {
            subnetId: pubSub1.ref, routeTableId: pubRT.ref,
        });
        new CfnSubnetRouteTableAssociation(this, 'PubRTAssoc2', {
            subnetId: pubSub2.ref, routeTableId: pubRT.ref,
        });

        // NAT Gateways (one per AZ for HA)
        const eip1 = new CfnEIP(this, 'NatEIP1', {domain: 'vpc'});
        const nat1 = new CfnNatGateway(this, 'NatGW1', {
            subnetId: pubSub1.ref, allocationId: eip1.attrAllocationId,
        });
        const eip2 = new CfnEIP(this, 'NatEIP2', {domain: 'vpc'});
        const nat2 = new CfnNatGateway(this, 'NatGW2', {
            subnetId: pubSub2.ref, allocationId: eip2.attrAllocationId,
        });

        // Private subnets
        const privSub1 = new CfnSubnet(this, 'PrivateSubnet1', {
            vpcId: vpc.ref, cidrBlock: privateSubnet1Cidr.valueAsString,
            availabilityZone: azs[0],
            tags: [{key: 'Name', value: `vpc-private-subnet-1-${stage.valueAsString}`}],
        });
        const privSub2 = new CfnSubnet(this, 'PrivateSubnet2', {
            vpcId: vpc.ref, cidrBlock: privateSubnet2Cidr.valueAsString,
            availabilityZone: azs[1],
            tags: [{key: 'Name', value: `vpc-private-subnet-2-${stage.valueAsString}`}],
        });

        // Private route tables (one per AZ for NAT routing)
        const privRT1 = new CfnRouteTable(this, 'PrivateRT1', {
            vpcId: vpc.ref,
            tags: [{key: 'Name', value: `private-rt-1-${stage.valueAsString}`}],
        });
        new CfnRoute(this, 'PrivateRoute1', {
            routeTableId: privRT1.ref,
            destinationCidrBlock: '0.0.0.0/0',
            natGatewayId: nat1.ref,
        });
        new CfnSubnetRouteTableAssociation(this, 'PrivRTAssoc1', {
            subnetId: privSub1.ref, routeTableId: privRT1.ref,
        });

        const privRT2 = new CfnRouteTable(this, 'PrivateRT2', {
            vpcId: vpc.ref,
            tags: [{key: 'Name', value: `private-rt-2-${stage.valueAsString}`}],
        });
        new CfnRoute(this, 'PrivateRoute2', {
            routeTableId: privRT2.ref,
            destinationCidrBlock: '0.0.0.0/0',
            natGatewayId: nat2.ref,
        });
        new CfnSubnetRouteTableAssociation(this, 'PrivRTAssoc2', {
            subnetId: privSub2.ref, routeTableId: privRT2.ref,
        });

        // Security group for cluster access
        const sg = new CfnSecurityGroup(this, 'ClusterAccessSG', {
            vpcId: vpc.ref,
            groupDescription: `Cluster access security group for ${stage.valueAsString}`,
            groupName: `cluster-access-sg-${stage.valueAsString}`,
        });
        new CfnSecurityGroupIngress(this, 'SGSelfIngress', {
            groupId: sg.attrGroupId,
            sourceSecurityGroupId: sg.attrGroupId,
            ipProtocol: '-1',
        });

        // Outputs
        new CfnOutput(this, 'VpcId', {
            value: vpc.ref,
            exportName: `VpcId-${stage.valueAsString}`,
        });
        new CfnOutput(this, 'PrivateSubnetIds', {
            value: Fn.join(',', [privSub1.ref, privSub2.ref]),
            exportName: `PrivateSubnetIds-${stage.valueAsString}`,
        });
        new CfnOutput(this, 'SecurityGroupId', {
            value: sg.attrGroupId,
            exportName: `ClusterAccessSGId-${stage.valueAsString}`,
        });
    }
}

// ─── OpenSearch Domain Stack (L1 — fully parameterized) ──────────────────────

class CfnOpenSearchDomainStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, {
            ...props,
            description: 'OpenSearch Service managed domain (deploy via CloudFormation)',
        });

        const stage = new CfnParameter(this, 'Stage', {
            type: 'String', default: 'dev',
            description: 'Environment stage name',
            maxLength: 15,
        });

        // ── VPC parameters (from NetworkStack outputs or user-provided) ──
        const vpcId = new CfnParameter(this, 'VpcId', {
            type: 'AWS::EC2::VPC::Id',
            description: 'VPC ID for the OpenSearch domain',
        });

        const subnetIds = new CfnParameter(this, 'SubnetIds', {
            type: 'List<AWS::EC2::Subnet::Id>',
            description: 'Comma-separated private subnet IDs (2 recommended for zone awareness)',
        });

        const securityGroupId = new CfnParameter(this, 'SecurityGroupId', {
            type: 'AWS::EC2::SecurityGroup::Id',
            description: 'Security group ID for the OpenSearch domain',
        });

        // ── Domain parameters ──
        const domainName = new CfnParameter(this, 'DomainName', {
            type: 'String', default: '',
            description: 'OpenSearch domain name (leave empty for auto: cluster-<stage>)',
        });

        const engineVersion = new CfnParameter(this, 'EngineVersion', {
            type: 'String', default: 'OpenSearch_2.19',
            description: 'Engine version (e.g. OpenSearch_2.19, Elasticsearch_7.10)',
        });

        // ── Capacity parameters ──
        const dataNodeType = new CfnParameter(this, 'DataNodeInstanceType', {
            type: 'String', default: 'r6g.large.search',
            description: 'Instance type for data nodes',
        });

        const dataNodeCount = new CfnParameter(this, 'DataNodeCount', {
            type: 'Number', default: 2,
            description: 'Number of data nodes',
            minValue: 1,
        });

        const dedicatedManagerNodeType = new CfnParameter(this, 'DedicatedManagerNodeType', {
            type: 'String', default: '',
            description: 'Instance type for dedicated manager nodes (leave empty to disable)',
        });

        const dedicatedManagerNodeCount = new CfnParameter(this, 'DedicatedManagerNodeCount', {
            type: 'Number', default: 0,
            description: 'Number of dedicated manager nodes (0 to disable)',
            minValue: 0,
        });

        // ── EBS parameters ──
        const ebsVolumeSize = new CfnParameter(this, 'EBSVolumeSize', {
            type: 'Number', default: 100,
            description: 'EBS volume size in GB per data node',
            minValue: 10,
        });

        const ebsVolumeType = new CfnParameter(this, 'EBSVolumeType', {
            type: 'String', default: 'gp3',
            description: 'EBS volume type',
            allowedValues: ['gp2', 'gp3', 'io1', 'io2', 'standard'],
        });

        const ebsIops = new CfnParameter(this, 'EBSIops', {
            type: 'Number', default: 3000,
            description: 'EBS IOPS (for gp3/io1/io2)',
            minValue: 0,
        });

        const ebsThroughput = new CfnParameter(this, 'EBSThroughput', {
            type: 'Number', default: 125,
            description: 'EBS throughput in MiB/s (for gp3)',
            minValue: 0,
        });

        // ── Conditions ──
        const hasDomainName = new CfnCondition(this, 'HasDomainName', {
            expression: Fn.conditionNot(Fn.conditionEquals(domainName.valueAsString, '')),
        });

        const hasDedicatedManagers = new CfnCondition(this, 'HasDedicatedManagers', {
            expression: Fn.conditionNot(Fn.conditionEquals(dedicatedManagerNodeCount.valueAsNumber, 0)),
        });

        const resolvedDomainName = Fn.conditionIf(
            hasDomainName.logicalId,
            domainName.valueAsString,
            `cluster-${stage.valueAsString}`,
        ).toString();

        // ── Domain ──
        const domain = new CfnDomain(this, 'Domain', {
            domainName: resolvedDomainName,
            engineVersion: engineVersion.valueAsString,
            clusterConfig: {
                instanceType: dataNodeType.valueAsString,
                instanceCount: dataNodeCount.valueAsNumber,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dedicatedMasterEnabled: Fn.conditionIf(hasDedicatedManagers.logicalId, true, false) as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dedicatedMasterType: Fn.conditionIf(hasDedicatedManagers.logicalId, dedicatedManagerNodeType.valueAsString, Fn.ref('AWS::NoValue')) as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dedicatedMasterCount: Fn.conditionIf(hasDedicatedManagers.logicalId, dedicatedManagerNodeCount.valueAsNumber, Fn.ref('AWS::NoValue')) as any,
                zoneAwarenessEnabled: true,
                zoneAwarenessConfig: {availabilityZoneCount: 2},
            },
            ebsOptions: {
                ebsEnabled: true,
                volumeSize: ebsVolumeSize.valueAsNumber,
                volumeType: ebsVolumeType.valueAsString,
                iops: ebsIops.valueAsNumber,
                throughput: ebsThroughput.valueAsNumber,
            },
            encryptionAtRestOptions: {enabled: true},
            nodeToNodeEncryptionOptions: {enabled: true},
            domainEndpointOptions: {
                enforceHttps: true,
                tlsSecurityPolicy: 'Policy-Min-TLS-1-2-2019-07',
            },
            vpcOptions: {
                subnetIds: subnetIds.valueAsList,
                securityGroupIds: [securityGroupId.valueAsString],
            },
            accessPolicies: {
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {'AWS': '*'},
                    Action: 'es:*',
                    Resource: '*',
                }],
            },
        });

        new CfnOutput(this, 'DomainEndpoint', {
            value: Fn.getAtt(domain.logicalId, 'DomainEndpoint').toString(),
            description: 'OpenSearch domain endpoint URL',
        });

        new CfnOutput(this, 'DomainArn', {
            value: Fn.getAtt(domain.logicalId, 'Arn').toString(),
            description: 'OpenSearch domain ARN',
        });
    }
}

// ─── App ─────────────────────────────────────────────────────────────────────

const app = new App();
new CfnNetworkStack(app, 'NetworkStack');
new CfnOpenSearchDomainStack(app, 'OpenSearchDomainStack');
app.synth();
