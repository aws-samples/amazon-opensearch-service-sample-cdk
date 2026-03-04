import {ISecurityGroup, IVpc, SubnetFilter, SubnetSelection, SubnetType, Vpc} from "aws-cdk-lib/aws-ec2";
import {CdkLogger} from "./cdk-logger";
import {Construct} from "constructs";

/**
 * Resolves VPC details for OpenSearch domain placement.
 * Handles both CDK-created VPCs and imported VPCs (via vpcId lookup).
 */
export class VpcDetails {
    public readonly vpc: IVpc;
    public readonly subnetSelection: SubnetSelection;
    public readonly clusterAccessSecurityGroup?: ISecurityGroup;

    private constructor(vpc: IVpc, subnetSelection: SubnetSelection, clusterAccessSecurityGroup?: ISecurityGroup) {
        this.vpc = vpc;
        this.subnetSelection = subnetSelection;
        this.clusterAccessSecurityGroup = clusterAccessSecurityGroup;
    }

    /**
     * Create VpcDetails from a CDK-created VPC (NetworkStack).
     */
    static fromCreatedVpc(vpc: IVpc, clusterAccessSecurityGroup: ISecurityGroup): VpcDetails {
        const subnetSelection = vpc.selectSubnets({
            onePerAz: true,
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        });
        return new VpcDetails(vpc, subnetSelection, clusterAccessSecurityGroup);
    }

    /**
     * Create VpcDetails by looking up an existing VPC by ID.
     * Must be called within a Stack scope (Vpc.fromLookup requires it).
     */
    static fromVpcLookup(scope: Construct, vpcId: string, clusterId: string, subnetIds?: string[]): VpcDetails {
        const vpc = Vpc.fromLookup(scope, `VPC-${clusterId}`, { vpcId });

        // Skip VPC validations for first synthesis stage (dummy VPC)
        if (vpc.vpcId === "vpc-12345") {
            return new VpcDetails(vpc, { subnets: vpc.privateSubnets });
        }

        CdkLogger.info(`[Cluster ID: ${clusterId}] Detected VPC with ${vpc.privateSubnets.length} private subnets, ${vpc.publicSubnets.length} public subnets, and ${vpc.isolatedSubnets.length} isolated subnets`);

        if (subnetIds) {
            const subnetSelection = VpcDetails.validateProvidedSubnetIds(vpc, subnetIds);
            return new VpcDetails(vpc, subnetSelection);
        }

        return new VpcDetails(vpc, VpcDetails.selectBestSubnets(vpc));
    }

    private static validateProvidedSubnetIds(vpc: IVpc, subnetIds: string[]): SubnetSelection {
        if (subnetIds.length < 1 || subnetIds.length > 3) {
            throw new Error(`The 'clusterSubnetIds' option must provide between 1 - 3 subnet ids, each in their own AZ. The following subnet ids were provided: [${subnetIds}]`);
        }
        const subnetType = VpcDetails.getSubnetTypeOfProvidedSubnets(vpc, subnetIds);
        const uniqueAzSubnets = vpc.selectSubnets({
            onePerAz: true,
            subnetType,
            subnetFilters: [SubnetFilter.byIds(subnetIds)],
        });
        if (uniqueAzSubnets.subnetIds.length !== subnetIds.length) {
            throw Error(`Not all subnet ids provided: [${subnetIds}] were in a unique AZ`);
        }
        return uniqueAzSubnets;
    }

    private static getSubnetTypeOfProvidedSubnets(vpc: IVpc, subnetIds: string[]): SubnetType {
        const subnetsTypeList: SubnetType[] = [];
        if (vpc.privateSubnets.length > 0) subnetsTypeList.push(SubnetType.PRIVATE_WITH_EGRESS);
        if (vpc.publicSubnets.length > 0) subnetsTypeList.push(SubnetType.PUBLIC);
        if (vpc.isolatedSubnets.length > 0) subnetsTypeList.push(SubnetType.PRIVATE_ISOLATED);

        for (const subnetType of subnetsTypeList) {
            const subnets = vpc.selectSubnets({
                subnetType,
                subnetFilters: [SubnetFilter.byIds(subnetIds)],
            });
            if (subnets.subnetIds.length === subnetIds.length) {
                return subnetType;
            }
        }
        throw Error(`Unable to find subnet ids: [${subnetIds}] in VPC: ${vpc.vpcId}. Please ensure all subnet ids exist and are of the same subnet type`);
    }

    private static selectBestSubnets(vpc: IVpc): SubnetSelection {
        if (vpc.privateSubnets.length < 1 && vpc.publicSubnets.length < 1) {
            throw new Error(`No private(with egress) or public subnets were detected in VPC: ${vpc.vpcId}.`);
        }
        const subnetType = vpc.privateSubnets.length > 0 ? SubnetType.PRIVATE_WITH_EGRESS : SubnetType.PUBLIC;
        const uniqueSubnets = vpc.selectSubnets({ onePerAz: true, subnetType });
        const sortedSubnetIds = uniqueSubnets.subnetIds.sort((a, b) => a.localeCompare(b));
        const desiredSubnetIds = sortedSubnetIds.slice(0, Math.min(sortedSubnetIds.length, 2));
        return vpc.selectSubnets({
            subnetFilters: [SubnetFilter.byIds(desiredSubnetIds)],
        });
    }
}
