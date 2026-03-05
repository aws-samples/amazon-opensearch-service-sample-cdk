#!/usr/bin/env node
/**
 * Synthesizes standalone CloudFormation templates from the real CDK stacks.
 *
 * Produces three templates:
 * 1. Combined (managed + serverless) — openSearchStack
 * 2. Managed domain only — managedDomainStack
 * 3. Serverless collection only — serverlessStack
 *
 * Usage:
 *   npx cdk synth --app "npx ts-node bin/cfn-synth.ts" --no-staging -o cfn.out
 */
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { StackComposer } from '../lib/stack-composer';

const account = process.env.CDK_DEFAULT_ACCOUNT ?? '123456789012';
const region = process.env.CDK_DEFAULT_REGION ?? 'us-east-1';
const azContext = {
    [`availability-zones:account=${account}:region=${region}`]: [
        `${region}a`, `${region}b`,
    ],
};

// 1. Combined template (managed + serverless)
const combinedApp = new App({
    context: {
        ...azContext,
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
new StackComposer(combinedApp, { env: { account, region } });
combinedApp.synth();

// 2. Managed domain only template
const managedApp = new App({
    outdir: 'cfn.out/managed',
    context: {
        ...azContext,
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
        ],
    },
});
new StackComposer(managedApp, { env: { account, region } });
managedApp.synth();

// 3. Serverless collection only template
const serverlessApp = new App({
    outdir: 'cfn.out/serverless',
    context: {
        ...azContext,
        stage: 'sample',
        clusters: [
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
new StackComposer(serverlessApp, { env: { account, region } });
serverlessApp.synth();
