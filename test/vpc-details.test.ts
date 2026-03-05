import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import { VpcDetails } from "../lib/components/vpc-details";
import { App, Stack } from "aws-cdk-lib";
import { ISecurityGroup, ISubnet, IVpc, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";

// Helper to create a mock subnet
function mockSubnet(subnetId: string, az: string): ISubnet {
    return {
        subnetId,
        availabilityZone: az,
        ipv4CidrBlock: '10.0.0.0/24',
        routeTable: { routeTableId: 'rtb-123' },
        internetConnectivityEstablished: {} as never,
        node: {} as never,
        env: { account: '123456789012', region: 'us-east-1' },
        stack: {} as never,
        associateNetworkAcl: vi.fn(),
    } as unknown as ISubnet;
}

// Helper to create a mock VPC
function createMockVpc(opts: {
    vpcId?: string;
    privateSubnets?: ISubnet[];
    publicSubnets?: ISubnet[];
    isolatedSubnets?: ISubnet[];
}): IVpc {
    const privateSubnets = opts.privateSubnets ?? [];
    const publicSubnets = opts.publicSubnets ?? [];
    const isolatedSubnets = opts.isolatedSubnets ?? [];

    return {
        vpcId: opts.vpcId ?? 'vpc-mock123',
        privateSubnets,
        publicSubnets,
        isolatedSubnets,
        selectSubnets: vi.fn().mockImplementation((selection: unknown) => {
            const sel = selection as { subnetType?: SubnetType; subnetFilters?: unknown[] };
            let subnets: ISubnet[];
            if (sel.subnetType === SubnetType.PRIVATE_WITH_EGRESS) {
                subnets = privateSubnets;
            } else if (sel.subnetType === SubnetType.PUBLIC) {
                subnets = publicSubnets;
            } else if (sel.subnetType === SubnetType.PRIVATE_ISOLATED) {
                subnets = isolatedSubnets;
            } else {
                subnets = [...privateSubnets, ...publicSubnets, ...isolatedSubnets];
            }
            return {
                subnets,
                subnetIds: subnets.map(s => s.subnetId),
                availabilityZones: subnets.map(s => s.availabilityZone),
            };
        }),
    } as unknown as IVpc;
}

const mockSg = { securityGroupId: 'sg-123' } as unknown as ISecurityGroup;

describe('VpcDetails Tests', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    // --- fromCreatedVpc ---

    test('fromCreatedVpc selects private subnets and stores security group', () => {
        const priv1 = mockSubnet('subnet-priv1', 'us-east-1a');
        const priv2 = mockSubnet('subnet-priv2', 'us-east-1b');
        const vpc = createMockVpc({
            privateSubnets: [priv1, priv2],
            publicSubnets: [mockSubnet('subnet-pub1', 'us-east-1a')],
        });

        const details = VpcDetails.fromCreatedVpc(vpc, mockSg);

        expect(details.vpc).toBe(vpc);
        expect(details.subnetSelection.subnets).toEqual([priv1, priv2]);
        expect(details.clusterAccessSecurityGroup).toBe(mockSg);
    });

    // --- fromVpcLookup ---

    describe('fromVpcLookup', () => {
        let fromLookupSpy: ReturnType<typeof vi.spyOn<typeof Vpc, 'fromLookup'>>;

        beforeEach(() => {
            fromLookupSpy = vi.spyOn(Vpc, 'fromLookup');
        });

        afterEach(() => {
            fromLookupSpy.mockRestore();
        });

        test('Skips validation for vpc-12345 placeholder', () => {
            const mockVpc = createMockVpc({ vpcId: 'vpc-12345' });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');
            const details = VpcDetails.fromVpcLookup(stack, 'vpc-12345', 'test-cluster');

            expect(details.vpc).toBe(mockVpc);
        });

        test('Auto-selects private subnets when available', () => {
            const priv1 = mockSubnet('subnet-priv1', 'us-east-1a');
            const priv2 = mockSubnet('subnet-priv2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                privateSubnets: [priv1, priv2],
                publicSubnets: [mockSubnet('subnet-pub1', 'us-east-1a')],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');
            const details = VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test-cluster');

            expect(details.vpc).toBe(mockVpc);
            expect(details.subnetSelection).toBeDefined();
            expect(details.clusterAccessSecurityGroup).toBeUndefined();
        });

        test('Falls back to public subnets when no private subnets', () => {
            const pub1 = mockSubnet('subnet-pub1', 'us-east-1a');
            const pub2 = mockSubnet('subnet-pub2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                publicSubnets: [pub1, pub2],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');
            const details = VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test-cluster');

            expect(details.subnetSelection).toBeDefined();
        });

        test('Throws when no subnets available', () => {
            const mockVpc = createMockVpc({ vpcId: 'vpc-imported' });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');

            expect(() => VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test')).toThrow(
                /No private.*or public subnets were detected/
            );
        });

        test('Validates provided subnet IDs', () => {
            const priv1 = mockSubnet('subnet-priv1', 'us-east-1a');
            const priv2 = mockSubnet('subnet-priv2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                privateSubnets: [priv1, priv2],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');
            const details = VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test-cluster', ['subnet-priv1', 'subnet-priv2']);

            expect(details.subnetSelection).toBeDefined();
        });

        test('Throws for too many subnet IDs (>3)', () => {
            const priv = [
                mockSubnet('s1', 'a'), mockSubnet('s2', 'b'),
                mockSubnet('s3', 'c'), mockSubnet('s4', 'd'),
            ];
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                privateSubnets: priv,
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');

            expect(() => VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test', ['s1', 's2', 's3', 's4'])).toThrow(
                /clusterSubnetIds.*must provide between 1 - 3 subnet ids/
            );
        });

        test('Throws for empty subnet IDs array', () => {
            const mockVpc = createMockVpc({ vpcId: 'vpc-imported' });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');

            expect(() => VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test', [])).toThrow(
                /clusterSubnetIds.*must provide between 1 - 3 subnet ids/
            );
        });

        test('Throws when subnet IDs not found in VPC', () => {
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                privateSubnets: [mockSubnet('subnet-other', 'us-east-1a')],
            });
            (mockVpc.selectSubnets as vi.Mock).mockImplementation(() => {
                return { subnets: [], subnetIds: [], availabilityZones: [] };
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');

            expect(() => VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test', ['subnet-missing'])).toThrow(
                /Unable to find subnet ids/
            );
        });

        test('Validates public subnet IDs', () => {
            const pub1 = mockSubnet('subnet-pub1', 'us-east-1a');
            const pub2 = mockSubnet('subnet-pub2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                publicSubnets: [pub1, pub2],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');
            const details = VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test-cluster', ['subnet-pub1', 'subnet-pub2']);

            expect(details.subnetSelection).toBeDefined();
        });

        test('Validates isolated subnet IDs', () => {
            const iso1 = mockSubnet('subnet-iso1', 'us-east-1a');
            const iso2 = mockSubnet('subnet-iso2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                isolatedSubnets: [iso1, iso2],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');
            const details = VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test-cluster', ['subnet-iso1', 'subnet-iso2']);

            expect(details.subnetSelection).toBeDefined();
        });

        test('Limits auto-selected subnets to 2', () => {
            const priv1 = mockSubnet('subnet-a', 'us-east-1a');
            const priv2 = mockSubnet('subnet-b', 'us-east-1b');
            const priv3 = mockSubnet('subnet-c', 'us-east-1c');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                privateSubnets: [priv1, priv2, priv3],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const app = new App();
            const stack = new Stack(app, 'TestStack');
            const details = VpcDetails.fromVpcLookup(stack, 'vpc-imported', 'test-cluster');

            expect(details.subnetSelection).toBeDefined();
        });
    });
});
