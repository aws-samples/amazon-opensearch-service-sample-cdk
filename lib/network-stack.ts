import {
    IpAddresses, IpProtocol,
    IVpc,
    SubnetFilter,
    SubnetSelection,
    SubnetType,
    Vpc
} from "aws-cdk-lib/aws-ec2";
import {Construct} from "constructs";
import {Stack, Tags} from "aws-cdk-lib";
import {CdkLogger} from "./cdk-logger";
import {StackPropsExt} from "./stack-composer";

export interface NetworkStackProps extends StackPropsExt {
    readonly vpcId?: string;
    readonly vpcSubnetIds?: string[];
    readonly vpcAZCount?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly env?: Record<string, any>;
}


export class NetworkStack extends Stack {
    public readonly vpcDetails: VpcDetails;


    constructor(scope: Construct, id: string, props: NetworkStackProps) {
        super(scope, id, props);
        let vpc: IVpc;
        const zoneCount = props.vpcAZCount ?? 2


        // Retrieve existing VPC
        if (props.vpcId) {
            vpc = Vpc.fromLookup(this, 'VPC', {
                vpcId: props.vpcId,
            });
        }
        // Create new VPC
        else {
            vpc = new Vpc(this, `Vpc`, {
                // Using 10.212.0.0/16 to avoid default VPC CIDR range conflicts when using VPC peering
                ipAddresses: IpAddresses.cidr('10.212.0.0/16'),
                ipProtocol: IpProtocol.DUAL_STACK,
                vpcName: `vpc-${props.stage}`,
                maxAzs: zoneCount
            });

            vpc.publicSubnets.forEach((subnet, index) => {
                Tags.of(subnet)
                    .add("Name", `vpc-public-subnet-${index + 1}-${props.stage}`);
            });
            vpc.privateSubnets.forEach((subnet, index) => {
                Tags.of(subnet)
                    .add("Name", `vpc-private-subnet-${index + 1}-${props.stage}`);
            });
        }
        this.vpcDetails = new VpcDetails(vpc, zoneCount, props.vpcSubnetIds);
    }
}

export class VpcDetails {
    public readonly subnetSelection: SubnetSelection;
    public readonly azCount: number;
    public readonly vpc: IVpc;

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

    private validateProvidedSubnetIds(vpc: IVpc, vpcSubnetIds: string[], azCount: number) {
        if (vpcSubnetIds.length != azCount) {
            throw new Error(`The number of provided subnets (${vpcSubnetIds.length}), must match the AZ count of ${azCount}. The setting can be specified with the 'vpcAZCount' option`)
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

    constructor(vpc: IVpc, azCount: number, vpcSubnetIds?: string[]) {
        this.vpc = vpc
        this.azCount = azCount
        CdkLogger.info(`Detected VPC with ${vpc.privateSubnets.length} private subnets, ${vpc.publicSubnets.length} public subnets, and ${vpc.isolatedSubnets.length} isolated subnets`)

        // Skip VPC validations for first synthesis stage which hasn't yet loaded in the VPC details from lookup
        if (vpc.vpcId == "vpc-12345") {
            return
        }

        if (vpcSubnetIds) {
            this.subnetSelection = this.validateProvidedSubnetIds(vpc, vpcSubnetIds, azCount)
        } else {
            if (vpc.privateSubnets.length < 1) {
                throw new Error(`No private subnets detected in VPC: ${vpc.vpcId}. Alternatively subnets can be manually specified with the 'vpcSubnetIds' context option`)
            }
            const uniqueAzPrivateSubnets = vpc.selectSubnets({
                onePerAz: true,
                subnetType: SubnetType.PRIVATE_WITH_EGRESS
            })
            if (uniqueAzPrivateSubnets.subnetIds.length < azCount) {
                throw new Error(`Not enough AZs (${azCount} unique AZs detected) used for private subnets to meet the ${azCount} AZ requirement. Alternatively subnets can be manually specified with the 'vpcSubnetIds' option and the AZ requirement set with the 'vpcAZCount' option`)
            }
            const desiredSubnetIds = uniqueAzPrivateSubnets.subnetIds
                .sort((a, b) => a.localeCompare(b))
                .slice(0, azCount);
            this.subnetSelection = vpc.selectSubnets({
                subnetFilters: [
                    SubnetFilter.byIds(desiredSubnetIds)
                ]
            })
        }
    }
}
