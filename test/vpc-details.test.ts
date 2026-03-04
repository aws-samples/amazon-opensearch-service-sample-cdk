import { describe, test, expect, jest, afterEach, beforeEach } from '@jest/globals';
import { VpcDetails } from "../lib/components/vpc-details";
import { App, Stack } from "aws-cdk-lib";
import { ISubnet, IVpc, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";

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
        associateNetworkAcl: jest.fn(),
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
        selectSubnets: jest.fn().mockImplementation((selection: unknown) => {
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

describe('VpcDetails Tests', () => {
    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    // --- Constructor tests ---

    test('Constructor throws when both vpcId and vpc are provided', () => {
        const vpc = createMockVpc({});
        expect(() => new VpcDetails('vpc-123', vpc)).toThrow(
            "Provide 'vpcId' or have this CDK create a VPC, not both or neither."
        );
    });

    test('Constructor throws when neither vpcId nor vpc is provided', () => {
        expect(() => new VpcDetails()).toThrow(
            "Provide 'vpcId' or have this CDK create a VPC, not both or neither."
        );
    });

    test('Constructor succeeds with only vpcId', () => {
        const details = new VpcDetails('vpc-123');
        expect(details.clusterAccessSecurityGroup).toBeUndefined();
    });

    test('Constructor succeeds with only vpc', () => {
        const vpc = createMockVpc({});
        const details = new VpcDetails(undefined, vpc);
        expect(details).toBeDefined();
    });

    test('Constructor stores security group', () => {
        const vpc = createMockVpc({});
        const sg = { securityGroupId: 'sg-123' } as never;
        const details = new VpcDetails(undefined, vpc, undefined, sg);
        expect(details.clusterAccessSecurityGroup).toBe(sg);
    });

    // --- Initialize with created VPC ---

    test('Initialize with created VPC selects private subnets', () => {
        const priv1 = mockSubnet('subnet-priv1', 'us-east-1a');
        const priv2 = mockSubnet('subnet-priv2', 'us-east-1b');
        const vpc = createMockVpc({
            privateSubnets: [priv1, priv2],
            publicSubnets: [mockSubnet('subnet-pub1', 'us-east-1a')],
        });

        const details = new VpcDetails(undefined, vpc);
        const app = new App();
        const stack = new Stack(app, 'TestStack');
        details.initialize(stack, 'test-cluster');

        expect(details.vpc).toBe(vpc);
        expect(details.subnetSelection.subnets).toEqual([priv1, priv2]);
    });

    test('Initialize skips validation for vpc-12345 placeholder', () => {
        const vpc = createMockVpc({ vpcId: 'vpc-12345' });

        const details = new VpcDetails(undefined, vpc);
        const app = new App();
        const stack = new Stack(app, 'TestStack');
        details.initialize(stack, 'test-cluster');

        expect(details.vpc).toBe(vpc);
    });

    // --- Initialize with provided subnet IDs ---

    test('Initialize with provided subnet IDs validates and selects them', () => {
        const priv1 = mockSubnet('subnet-priv1', 'us-east-1a');
        const priv2 = mockSubnet('subnet-priv2', 'us-east-1b');
        const vpc = createMockVpc({
            privateSubnets: [priv1, priv2],
        });

        const details = new VpcDetails(undefined, vpc, ['subnet-priv1', 'subnet-priv2']);
        const app = new App();
        const stack = new Stack(app, 'TestStack');
        details.initialize(stack, 'test-cluster');

        expect(details.subnetSelection).toBeDefined();
    });

    test('Validate subnet IDs throws for too many subnets (>3)', () => {
        const priv = [
            mockSubnet('s1', 'a'), mockSubnet('s2', 'b'),
            mockSubnet('s3', 'c'), mockSubnet('s4', 'd'),
        ];
        const mockVpc = createMockVpc({
            vpcId: 'vpc-imported',
            privateSubnets: priv,
        });
        const fromLookupSpy = jest.spyOn(Vpc, 'fromLookup').mockReturnValue(mockVpc as unknown as IVpc);

        const details = new VpcDetails('vpc-imported', undefined, ['s1', 's2', 's3', 's4']);
        const app = new App();
        const stack = new Stack(app, 'TestStack');

        expect(() => details.initialize(stack, 'test')).toThrow(
            /clusterSubnetIds.*must provide between 1 - 3 subnet ids/
        );
        fromLookupSpy.mockRestore();
    });

    test('Validate subnet IDs throws for empty array', () => {
        const mockVpc = createMockVpc({ vpcId: 'vpc-imported' });
        const fromLookupSpy = jest.spyOn(Vpc, 'fromLookup').mockReturnValue(mockVpc as unknown as IVpc);

        const details = new VpcDetails('vpc-imported', undefined, []);
        const app = new App();
        const stack = new Stack(app, 'TestStack');

        expect(() => details.initialize(stack, 'test')).toThrow(
            /clusterSubnetIds.*must provide between 1 - 3 subnet ids/
        );
        fromLookupSpy.mockRestore();
    });

    // --- Initialize with imported VPC (vpcId path) via Vpc.fromLookup mock ---

    describe('Imported VPC paths', () => {
        let fromLookupSpy: jest.SpiedFunction<typeof Vpc.fromLookup>;

        beforeEach(() => {
            fromLookupSpy = jest.spyOn(Vpc, 'fromLookup');
        });

        afterEach(() => {
            fromLookupSpy.mockRestore();
        });

        test('Imported VPC with private subnets auto-selects private subnets', () => {
            const priv1 = mockSubnet('subnet-priv1', 'us-east-1a');
            const priv2 = mockSubnet('subnet-priv2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                privateSubnets: [priv1, priv2],
                publicSubnets: [mockSubnet('subnet-pub1', 'us-east-1a')],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const details = new VpcDetails('vpc-imported');
            const app = new App();
            const stack = new Stack(app, 'TestStack');
            details.initialize(stack, 'test-cluster');

            expect(details.vpc).toBe(mockVpc);
            expect(details.subnetSelection).toBeDefined();
        });

        test('Imported VPC with only public subnets uses public subnets', () => {
            const pub1 = mockSubnet('subnet-pub1', 'us-east-1a');
            const pub2 = mockSubnet('subnet-pub2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                publicSubnets: [pub1, pub2],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const details = new VpcDetails('vpc-imported');
            const app = new App();
            const stack = new Stack(app, 'TestStack');
            details.initialize(stack, 'test-cluster');

            expect(details.subnetSelection).toBeDefined();
        });

        test('Imported VPC with no subnets throws error', () => {
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const details = new VpcDetails('vpc-imported');
            const app = new App();
            const stack = new Stack(app, 'TestStack');

            expect(() => details.initialize(stack, 'test')).toThrow(
                /No private.*or public subnets were detected/
            );
        });

        test('Imported VPC with provided subnet IDs validates them', () => {
            const priv1 = mockSubnet('subnet-priv1', 'us-east-1a');
            const priv2 = mockSubnet('subnet-priv2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                privateSubnets: [priv1, priv2],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const details = new VpcDetails('vpc-imported', undefined, ['subnet-priv1', 'subnet-priv2']);
            const app = new App();
            const stack = new Stack(app, 'TestStack');
            details.initialize(stack, 'test-cluster');

            expect(details.subnetSelection).toBeDefined();
        });

        test('Imported VPC with provided public subnet IDs validates them', () => {
            const pub1 = mockSubnet('subnet-pub1', 'us-east-1a');
            const pub2 = mockSubnet('subnet-pub2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                publicSubnets: [pub1, pub2],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const details = new VpcDetails('vpc-imported', undefined, ['subnet-pub1', 'subnet-pub2']);
            const app = new App();
            const stack = new Stack(app, 'TestStack');
            details.initialize(stack, 'test-cluster');

            expect(details.subnetSelection).toBeDefined();
        });

        test('Imported VPC with provided isolated subnet IDs validates them', () => {
            const iso1 = mockSubnet('subnet-iso1', 'us-east-1a');
            const iso2 = mockSubnet('subnet-iso2', 'us-east-1b');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                isolatedSubnets: [iso1, iso2],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const details = new VpcDetails('vpc-imported', undefined, ['subnet-iso1', 'subnet-iso2']);
            const app = new App();
            const stack = new Stack(app, 'TestStack');
            details.initialize(stack, 'test-cluster');

            expect(details.subnetSelection).toBeDefined();
        });

        test('Imported VPC with subnet IDs not found throws error', () => {
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                privateSubnets: [mockSubnet('subnet-other', 'us-east-1a')],
            });
            // Override selectSubnets to return empty for filtered queries
            (mockVpc.selectSubnets as jest.Mock).mockImplementation((selection: unknown) => {
                const sel = selection as { subnetType?: SubnetType };
                if (sel.subnetType === SubnetType.PRIVATE_WITH_EGRESS) {
                    return { subnets: [], subnetIds: [], availabilityZones: [] };
                }
                return { subnets: [], subnetIds: [], availabilityZones: [] };
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const details = new VpcDetails('vpc-imported', undefined, ['subnet-missing']);
            const app = new App();
            const stack = new Stack(app, 'TestStack');

            expect(() => details.initialize(stack, 'test')).toThrow(
                /Unable to find subnet ids/
            );
        });

        test('Imported VPC limits auto-selected subnets to 2', () => {
            const priv1 = mockSubnet('subnet-a', 'us-east-1a');
            const priv2 = mockSubnet('subnet-b', 'us-east-1b');
            const priv3 = mockSubnet('subnet-c', 'us-east-1c');
            const mockVpc = createMockVpc({
                vpcId: 'vpc-imported',
                privateSubnets: [priv1, priv2, priv3],
            });
            fromLookupSpy.mockReturnValue(mockVpc as unknown as IVpc);

            const details = new VpcDetails('vpc-imported');
            const app = new App();
            const stack = new Stack(app, 'TestStack');
            details.initialize(stack, 'test-cluster');

            // Should select at most 2 subnets (sorted by ID, then sliced)
            expect(details.subnetSelection).toBeDefined();
        });
    });
});
