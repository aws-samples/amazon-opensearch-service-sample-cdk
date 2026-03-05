#!/usr/bin/env node
/**
 * Synthesizes standalone CloudFormation templates from the real CDK stacks.
 *
 * Instead of maintaining parallel L1 constructs, this script uses the actual
 * StackComposer with example configs to produce CFN templates that exactly
 * match what `cdk deploy` would create.
 *
 * Produces three stacks:
 *   - NetworkStack: VPC, subnets, NAT gateways, security group, flow logs
 *   - OpenSearchDomainStack: Managed OpenSearch Service domain
 *   - ServerlessCollectionStack: OpenSearch Serverless collection
 *
 * Usage:
 *   npx cdk synth --app "npx ts-node bin/cfn-synth.ts" --no-staging -o cfn.out
 */
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { StackComposer } from '../lib/stack-composer';

const account = process.env.CDK_DEFAULT_ACCOUNT ?? '123456789012';
const region = process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

const app = new App({
    context: {
        // Provide AZ context so CDK doesn't need AWS credentials for VPC synthesis
        [`availability-zones:account=${account}:region=${region}`]: [
            `${region}a`, `${region}b`,
        ],
        stage: 'sample',
        vpcAZCount: 2,
        clusters: [
            {
                clusterId: 'domain',
                clusterType: 'OPENSEARCH_MANAGED_SERVICE',
                clusterVersion: 'OS_2.19',
                dataNodeType: 'r6g.large.search',
                dataNodeCount: 2,
                ebsEnabled: true,
                ebsVolumeSize: 100,
                ebsVolumeType: 'GP3',
                enforceHTTPS: true,
                domainRemovalPolicy: 'RETAIN',
            },
            {
                clusterId: 'search',
                clusterType: 'OPENSEARCH_SERVERLESS',
                collectionType: 'SEARCH',
                standbyReplicas: 'DISABLED',
                domainRemovalPolicy: 'DESTROY',
            },
        ],
    },
});

new StackComposer(app, {
    env: {
        account,
        region,
    },
});

app.synth();
