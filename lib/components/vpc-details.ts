import {ISecurityGroup, IVpc, SubnetFilter, SubnetSelection, SubnetType, Vpc} from "aws-cdk-lib/aws-ec2";
import {CdkLogger} from "./cdk-logger";
import {Construct} from "constructs";

export class VpcDetails {
    public subnetSelection: SubnetSelection;
    public vpc: IVpc;
    public readonly clusterAccessSecurityGroup?: ISecurityGroup;
    private readonly createdVpc?: IVpc;
    private readonly vpcId?: string;
    private readonly vpcSubnetIds?: string[];


    /**
     *  This function returns the SubnetType of a list of subnet ids, and throws an error if the subnets do not exist
     *  in the VPC or are of different subnet types.
     *
     *  There is a limitation on the vpc.selectSubnets() call which requires the SubnetType to be provided or else an
     *  empty list will be returned if public subnets are provided, thus this function tries different subnet types if
     *  unable to select the provided subnetIds
     */
    private getSubnetTypeOfProvidedSubnets(vpc: IVpc, subnetIds: string[]): SubnetType {
        const subnetsTypeList = []
        if (vpc.privateSubnets.length > 0) {
            subnetsTypeList.push(SubnetType.PRIVATE_WITH_EGRESS)
        }
        if (vpc.publicSubnets.length > 0) {
            subnetsTypeList.push(SubnetType.PUBLIC)
        }
        if (vpc.isolatedSubnets.length > 0) {
            subnetsTypeList.push(SubnetType.PRIVATE_ISOLATED)
        }
        for (const subnetType of subnetsTypeList) {
            const subnets = vpc.selectSubnets({
                subnetType: subnetType,
                subnetFilters: [SubnetFilter.byIds(subnetIds)]
            })
            if (subnets.subnetIds.length == subnetIds.length) {
                return subnetType
            }
        }
        throw Error(`Unable to find subnet ids: [${subnetIds}] in VPC: ${vpc.vpcId}. Please ensure all subnet ids exist and are of the same subnet type`)
    }

    private validateProvidedSubnetIds(vpc: IVpc, vpcSubnetIds: string[]) {
        if (vpcSubnetIds.length < 1 || vpcSubnetIds.length > 3) {
            throw new Error(`The 'clusterSubnetIds' option must provide between 1 - 3 subnet ids, each in their own AZ. The following subnet ids were provided: [${vpcSubnetIds}]`)
        }
        const subnetType = this.getSubnetTypeOfProvidedSubnets(vpc, vpcSubnetIds);
        const uniqueAzSubnets = vpc.selectSubnets({
            onePerAz: true,
            subnetType: subnetType,
            subnetFilters: [SubnetFilter.byIds(vpcSubnetIds)]
        })
        if (uniqueAzSubnets.subnetIds.length != vpcSubnetIds.length) {
            throw Error(`Not all subnet ids provided: [${vpcSubnetIds}] were in a unique AZ`)
        }
        return uniqueAzSubnets
    }

    constructor(vpcId?: string, vpc?: IVpc, vpcSubnetIds?: string[], clusterAccessSecurityGroup?: ISecurityGroup) {
        this.vpcId = vpcId
        this.createdVpc = vpc
        this.vpcSubnetIds = vpcSubnetIds
        this.clusterAccessSecurityGroup = clusterAccessSecurityGroup

        const hasVpcId = !!this.vpcId;
        const hasVpc = !!this.createdVpc;

        if (hasVpcId === hasVpc) {
            throw new Error("Provide 'vpcId' or have this CDK create a VPC, not both or neither.");
        }
    }

    initialize(scope: Construct, clusterId: string) {
        const vpcId = this.vpcId
        const createdVpc = this.createdVpc
        const vpcSubnetIds = this.vpcSubnetIds

        this.vpc = createdVpc ?? Vpc.fromLookup(scope, 'VPC', { vpcId: vpcId });
        const resolvedVpc = this.vpc;

        // Skip VPC validations for first synthesis stage which hasn't yet loaded in the VPC details from lookup
        if (resolvedVpc.vpcId == "vpc-12345") {
            return
        } else {
            CdkLogger.info(`[Cluster ID: ${clusterId}] Detected VPC with ${resolvedVpc.privateSubnets.length} private subnets, ${resolvedVpc.publicSubnets.length} public subnets, and ${resolvedVpc.isolatedSubnets.length} isolated subnets`)
        }

        // If we have created the VPC, select private subnets
        if (createdVpc) {
            this.subnetSelection = resolvedVpc.selectSubnets({
                onePerAz: true,
                subnetType: SubnetType.PRIVATE_WITH_EGRESS
            })
        }
        // Use the user specific VPC subnet ids
        else if (vpcSubnetIds) {
            this.subnetSelection = this.validateProvidedSubnetIds(resolvedVpc, vpcSubnetIds)
        }
        // Determine subnets to use from only user specified VPC
        else {
            if (resolvedVpc.privateSubnets.length < 1 && resolvedVpc.publicSubnets.length < 1) {
                throw new Error(`No private(with egress) or public subnets were detected in VPC: ${resolvedVpc.vpcId}.`)
            }
            let uniqueSubnets
            if (resolvedVpc.privateSubnets.length > 0) {
                uniqueSubnets = resolvedVpc.selectSubnets({
                    onePerAz: true,
                    subnetType: SubnetType.PRIVATE_WITH_EGRESS
                })
            } else {
                uniqueSubnets = resolvedVpc.selectSubnets({
                    onePerAz: true,
                    subnetType: SubnetType.PUBLIC
                })
            }
            const sortedSubnetIds = uniqueSubnets.subnetIds.sort((a, b) => a.localeCompare(b));
            const desiredSubnetIds = sortedSubnetIds.slice(0, Math.min(sortedSubnetIds.length, 2));
            this.subnetSelection = resolvedVpc.selectSubnets({
                subnetFilters: [SubnetFilter.byIds(desiredSubnetIds)],
            });

        }
    }
}