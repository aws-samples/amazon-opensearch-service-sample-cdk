import { Template } from "aws-cdk-lib/assertions";
import { App, Stack } from "aws-cdk-lib";
import { Vpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { describe, test, expect } from "vitest";
import { createManagedDomain } from "../lib/components/managed-domain";
import { ClusterType } from "../lib/components/common-utilities";
import { ManagedClusterConfig } from "../lib/components/cluster-config";
import { VpcDetails } from "../lib/components/vpc-details";

interface IamPolicyResource {
    Properties: {
        PolicyName?: string;
        PolicyDocument: { Statement: PolicyStatementJson[] };
        Roles?: unknown[];
    };
    DependsOn?: string[];
}

interface PolicyStatementJson {
    Action: string | string[];
    Resource: unknown;
    Effect?: string;
}

function makeManagedConfig(id: string, name: string): ManagedClusterConfig {
    return {
        clusterId: id,
        clusterName: name,
        clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
        version: "OS_2.19",
        openAccessPolicyEnabled: true,
        dataNodeCount: 2,
        dataNodeType: "r5.large.search",
        dedicatedManagerNodeCount: 0,
        multiAZWithStandbyEnabled: false,
        zoneAwareness: { enabled: false, availabilityZoneCount: 2 },
        ebsEnabled: true,
        ebsVolumeSize: 10,
        ebsVolumeType: "GENERAL_PURPOSE_SSD",
        useUnsignedBasicAuth: false,
        nodeToNodeEncryptionEnabled: true,
        encryptionAtRestEnabled: true,
        domainRemovalPolicy: undefined,
        enforceHTTPS: true,
        enableAutoSoftwareUpdate: false,
    } as unknown as ManagedClusterConfig;
}

function statementGrantsUpdateDomainConfigOnWildcard(stmt: PolicyStatementJson): boolean {
    const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
    if (!actions.includes("es:UpdateDomainConfig")) return false;
    const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
    return resources.some(r => JSON.stringify(r).includes("domain/*"));
}

describe("AccessPolicy IAM eventual-consistency race fix", () => {
    test("two managed domains: singleton-role DefaultPolicy contains a wildcard es:UpdateDomainConfig grant, eliminating the per-domain attach race", () => {
        const app = new App({ context: { stage: "test" } });
        const stack = new Stack(app, "TestStack", { env: { account: "111111111111", region: "us-east-1" } });
        const vpc = new Vpc(stack, "Vpc", { maxAzs: 2 });
        const sg = new SecurityGroup(stack, "Sg", { vpc });
        const vpcDetails = VpcDetails.fromCreatedVpc(vpc, sg);

        // Two managed domains, mirroring the source/target shape that historically tripped the race.
        createManagedDomain(stack, makeManagedConfig("source", "src-domain"), "test", vpcDetails);
        createManagedDomain(stack, makeManagedConfig("target", "tgt-domain"), "test", vpcDetails);

        const tpl = Template.fromStack(stack);
        const policies = tpl.findResources("AWS::IAM::Policy") as Record<string, IamPolicyResource>;

        // Locate the singleton AwsCustomResource role's auto-managed DefaultPolicy.
        const defaultPolicyEntry = Object.entries(policies).find(([name]) =>
            /^AWS[0-9a-f]+ServiceRoleDefaultPolicy/.test(name)
        );
        expect(defaultPolicyEntry, "expected an AwsCustomResource singleton-role DefaultPolicy").toBeDefined();
        if (!defaultPolicyEntry) return;
        const [, defaultPolicy] = defaultPolicyEntry;
        const wildcardStmt = defaultPolicy.Properties.PolicyDocument.Statement
            .find(statementGrantsUpdateDomainConfigOnWildcard);
        expect(wildcardStmt, "DefaultPolicy must grant es:UpdateDomainConfig on a domain/* wildcard").toBeDefined();

        // Per-domain CustomResourcePolicy attachments still emit (correctly scoped to each domain),
        // but they're no longer the only path that grants UpdateDomainConfig — so a slow IAM
        // propagation on the second attach can no longer cause AccessDenied at deploy time.
        const perDomainScoped = Object.entries(policies).filter(([, res]) =>
            res.Properties.PolicyDocument.Statement.some(s => {
                const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
                return actions.includes("es:UpdateDomainConfig") &&
                    !statementGrantsUpdateDomainConfigOnWildcard(s);
            })
        );
        expect(perDomainScoped.length).toBe(2); // one per domain, unchanged from prior behavior
    });
});
