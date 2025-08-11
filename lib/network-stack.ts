import {
    IpAddresses, IpProtocol, ISecurityGroup,
    IVpc, Port, SecurityGroup,
    Vpc
} from "aws-cdk-lib/aws-ec2";
import {Construct} from "constructs";
import {CfnOutput, Stack, Tags} from "aws-cdk-lib";

import {StackPropsExt} from "./stack-composer";

export interface NetworkStackProps extends StackPropsExt {
    readonly vpcAZCount?: number;
    readonly vpcCidr?: string;
}

export class NetworkStack extends Stack {
    // Using 10.212.0.0/16 to avoid default VPC CIDR range conflicts when using VPC peering
    public static readonly DEFAULT_VPC_CIDR = '10.212.0.0/16';

    public readonly vpc: IVpc;
    public readonly clusterAccessSecurityGroup: ISecurityGroup;

    constructor(scope: Construct, id: string, props: NetworkStackProps) {
        super(scope, id, props);
        const zoneCount = props.vpcAZCount ?? 2

        if (zoneCount < 1 || zoneCount > 3) {
            throw new Error(`The 'vpcAZCount' option must be a number between 1 - 3, but received an AZ count of ${zoneCount}`)
        }

        const cidr = props.vpcCidr ?? NetworkStack.DEFAULT_VPC_CIDR
        this.vpc = new Vpc(this, `Vpc`, {
            ipAddresses: IpAddresses.cidr(cidr),
            ipProtocol: IpProtocol.DUAL_STACK,
            vpcName: `vpc-${props.stage}`,
            maxAzs: zoneCount
        });

        this.vpc.publicSubnets.forEach((subnet, index) => {
            Tags.of(subnet)
                .add("Name", `vpc-public-subnet-${index + 1}-${props.stage}`);
        });
        this.vpc.privateSubnets.forEach((subnet, index) => {
            Tags.of(subnet)
                .add("Name", `vpc-private-subnet-${index + 1}-${props.stage}`);
        });

        this.clusterAccessSecurityGroup = new SecurityGroup(this, 'clusterAccessVpcSecurityGroup', {
            vpc: this.vpc,
            allowAllOutbound: false,
            allowAllIpv6Outbound: false,
            securityGroupName: `cluster-access-security-group-${props.stage}`
        });
        this.clusterAccessSecurityGroup.addIngressRule(this.clusterAccessSecurityGroup, Port.allTraffic());

        new CfnOutput(this, `VpcIdExport-${props.stage}`, {
            exportName: `VpcId-${props.stage}`,
            value: this.vpc.vpcId,
            description: 'The VPC id of the created VPC',
        });
    }
}
