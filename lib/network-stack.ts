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
}


export class NetworkStack extends Stack {
    public readonly vpc: IVpc;
    public readonly defaultSecurityGroup: ISecurityGroup;

    constructor(scope: Construct, id: string, props: NetworkStackProps) {
        super(scope, id, props);
        const zoneCount = props.vpcAZCount ?? 2

        if (zoneCount < 1 || zoneCount > 3) {
            throw new Error(`The 'vpcAZCount' option must be a number between 1 - 3, but received an AZ count of ${zoneCount}`)
        }

        this.vpc = new Vpc(this, `Vpc`, {
            // Using 10.212.0.0/16 to avoid default VPC CIDR range conflicts when using VPC peering
            ipAddresses: IpAddresses.cidr('10.212.0.0/16'),
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

        this.defaultSecurityGroup = new SecurityGroup(this, 'defaultVpcSecurityGroup', {
            vpc: this.vpc,
            allowAllOutbound: false,
            allowAllIpv6Outbound: false,
        });
        this.defaultSecurityGroup.addIngressRule(this.defaultSecurityGroup, Port.allTraffic());

        new CfnOutput(scope, `VpcIdExport-${props.stage}`, {
            exportName: `VpcId-${props.stage}`,
            value: this.vpc.vpcId,
            description: 'The VPC id of the created VPC',
        });
    }
}
