import {Construct} from "constructs";
import {CfnOutput, Fn, Stack, StackProps, Tags} from "aws-cdk-lib";
import {
    CfnInternetGateway, CfnNatGateway, CfnEIP, CfnRouteTable,
    FlowLogDestination, FlowLogTrafficType,
    IpAddresses, IpProtocol, Peer, Port,
    SecurityGroup, Vpc,
} from "aws-cdk-lib/aws-ec2";
import {VpcDetails} from "./components/vpc-details";
import {ManagedClusterConfig, ServerlessClusterConfig} from "./components/cluster-config";
import {createManagedDomain} from "./components/managed-domain";
import {createServerlessCollection} from "./components/serverless-collection";

export interface OpenSearchStackProps extends StackProps {
    readonly stage: string;
    readonly managedClusters: ManagedClusterConfig[];
    readonly serverlessClusters: ServerlessClusterConfig[];
    /** Existing VPC ID — when set, looks up the VPC instead of creating one */
    readonly vpcId?: string;
    readonly vpcAZCount?: number;
    readonly vpcCidr?: string;
    /** Enable dual-stack (IPv4+IPv6) VPC — when false, creates IPv4-only (default: true) */
    readonly supportIpv6?: boolean;
}

export class OpenSearchStack extends Stack {

    constructor(scope: Construct, id: string, props: OpenSearchStackProps) {
        super(scope, id, props);

        const {stage, managedClusters, serverlessClusters} = props;
        const hasManagedClusters = managedClusters.length > 0;
        const serverlessNeedsVpc = serverlessClusters.some(c => c.createVpcEndpoint);

        // --- VPC (when managed clusters need it or serverless needs a VPC endpoint) ---
        let vpcDetails: VpcDetails | undefined;
        if (hasManagedClusters || serverlessNeedsVpc) {
            if (props.vpcId) {
                const clusterId = hasManagedClusters ? managedClusters[0].clusterId : serverlessClusters[0].clusterId;
                const subnetIds = hasManagedClusters ? managedClusters[0].clusterSubnetIds : undefined;
                const allowAllVpcTraffic = managedClusters.some(c => c.allowAllVpcTraffic);
                let sg: SecurityGroup | undefined;
                if (allowAllVpcTraffic) {
                    const importedVpc = Vpc.fromLookup(this, 'ImportedVpc', { vpcId: props.vpcId });
                    sg = new SecurityGroup(this, 'clusterAccessVpcSecurityGroup', {
                        vpc: importedVpc,
                        allowAllOutbound: false,
                        allowAllIpv6Outbound: false,
                        securityGroupName: `cluster-access-security-group-${stage}`,
                    });
                    sg.addIngressRule(sg, Port.allTraffic());
                    Tags.of(sg).add("Name", `cluster-access-sg-${stage}`);
                    sg.addIngressRule(Peer.ipv4(importedVpc.vpcCidrBlock), Port.allTraffic(), 'Allow all traffic from VPC CIDR');
                    if (props.supportIpv6 !== false) {
                        sg.addIngressRule(Peer.anyIpv6(), Port.allTraffic(), 'Allow all IPv6 traffic from VPC');
                    }
                }
                vpcDetails = VpcDetails.fromVpcLookup(this, props.vpcId, clusterId, subnetIds, sg);
            } else {
                const allowAllVpcTraffic = managedClusters.some(c => c.allowAllVpcTraffic);
                vpcDetails = this.createVpc(stage, props.vpcAZCount, props.vpcCidr, allowAllVpcTraffic, props.supportIpv6);
            }
        }

        // --- Managed domains ---
        for (const config of managedClusters) {
            if (!vpcDetails) {
                throw new Error("Internal error: VPC details should be resolved for managed clusters");
            }
            createManagedDomain(this, config, stage, vpcDetails);
        }

        // --- Serverless collections ---
        for (const config of serverlessClusters) {
            createServerlessCollection(this, config, stage, vpcDetails);
        }
    }

    private createVpc(stage: string, vpcAZCount?: number, vpcCidr?: string, allowAllVpcTraffic?: boolean, supportIpv6?: boolean): VpcDetails {
        const zoneCount = vpcAZCount ?? 2;
        if (zoneCount < 1 || zoneCount > 3) {
            throw new Error(`The 'vpcAZCount' option must be a number between 1 - 3, but received an AZ count of ${zoneCount}`);
        }
        const cidr = vpcCidr ?? '10.212.0.0/16';
        const dualStack = supportIpv6 !== false; // default true
        const vpc = new Vpc(this, 'Vpc', {
            ipAddresses: IpAddresses.cidr(cidr),
            ipProtocol: dualStack ? IpProtocol.DUAL_STACK : IpProtocol.IPV4_ONLY,
            vpcName: `vpc-${stage}`,
            maxAzs: zoneCount,
            flowLogs: {
                defaultFlowLog: {
                    destination: FlowLogDestination.toCloudWatchLogs(),
                    trafficType: FlowLogTrafficType.REJECT,
                },
            },
        });

        vpc.publicSubnets.forEach((subnet, index) => {
            Tags.of(subnet).add("Name", `vpc-public-subnet-${index + 1}-${stage}`);
        });
        vpc.privateSubnets.forEach((subnet, index) => {
            Tags.of(subnet).add("Name", `vpc-private-subnet-${index + 1}-${stage}`);
        });

        this.tagVpcChildResources(vpc, stage);

        const sg = new SecurityGroup(this, 'clusterAccessVpcSecurityGroup', {
            vpc,
            allowAllOutbound: false,
            allowAllIpv6Outbound: false,
            securityGroupName: `cluster-access-security-group-${stage}`,
        });
        sg.addIngressRule(sg, Port.allTraffic());
        Tags.of(sg).add("Name", `cluster-access-sg-${stage}`);

        // Allow all traffic from VPC CIDR when any managed cluster requests it
        if (allowAllVpcTraffic) {
            sg.addIngressRule(Peer.ipv4(cidr), Port.allTraffic(), 'Allow all traffic from VPC CIDR');
            if (dualStack) {
                sg.addIngressRule(Peer.ipv6(Fn.select(0, vpc.vpcIpv6CidrBlocks)), Port.allTraffic(), 'Allow all IPv6 traffic from VPC CIDR');
            }
        }

        new CfnOutput(this, `VpcIdExport-${stage}`, {
            exportName: `VpcId-${stage}`,
            value: vpc.vpcId,
            description: 'The VPC id of the created VPC',
        });

        return VpcDetails.fromCreatedVpc(vpc, sg);
    }

    private tagVpcChildResources(vpc: Vpc, stage: string) {
        const igw = vpc.node.tryFindChild('IGW') as CfnInternetGateway | undefined;
        if (igw) {
            Tags.of(igw).add("Name", `igw-${stage}`);
        }

        vpc.publicSubnets.forEach((subnet, index) => {
            const natGw = subnet.node.tryFindChild('NATGateway') as CfnNatGateway | undefined;
            if (natGw) {
                Tags.of(natGw).add("Name", `nat-public-${index + 1}-${stage}`);
            }
            const eip = subnet.node.tryFindChild('EIP') as CfnEIP | undefined;
            if (eip) {
                Tags.of(eip).add("Name", `eip-public-${index + 1}-${stage}`);
            }
            const rt = subnet.node.tryFindChild('RouteTable') as CfnRouteTable | undefined;
            if (rt) {
                Tags.of(rt).add("Name", `rt-public-${index + 1}-${stage}`);
            }
        });

        vpc.privateSubnets.forEach((subnet, index) => {
            const rt = subnet.node.tryFindChild('RouteTable') as CfnRouteTable | undefined;
            if (rt) {
                Tags.of(rt).add("Name", `rt-private-${index + 1}-${stage}`);
            }
        });
    }
}
