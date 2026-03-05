import { Aspects, App } from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { StackComposer } from '../lib/stack-composer';
import { describe, test, expect } from 'vitest';

function createNagApp(context: Record<string, unknown>) {
    context.stage = context.stage ?? 'nag-test';
    const app = new App({ context });
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
    const composer = new StackComposer(app, {
        env: { account: 'test-account', region: 'us-east-1' },
    });
    app.synth();
    return composer;
}

describe('cdk-nag AWS Solutions Checks', () => {
    test('Managed domain stack has no errors', () => {
        const composer = createNagApp({
            clusters: [{
                clusterId: 'nag-domain',
                clusterType: 'OPENSEARCH_MANAGED_SERVICE',
                nodeToNodeEncryption: true,
                encryptionAtRestEnabled: true,
                enforceHTTPS: true,
                ebsEnabled: true,
            }],
        });

        for (const stack of composer.stacks) {
            const annotations = Annotations.fromStack(stack);
            const errors = annotations.findError('*', Match.stringLikeRegexp('.*'));
            expect(errors).toEqual([]);
        }
    });

    test('Serverless collection stack has no errors', () => {
        const composer = createNagApp({
            clusters: [{
                clusterId: 'nag-serverless',
                clusterType: 'OPENSEARCH_SERVERLESS',
                collectionType: 'SEARCH',
            }],
        });

        for (const stack of composer.stacks) {
            const annotations = Annotations.fromStack(stack);
            const errors = annotations.findError('*', Match.stringLikeRegexp('.*'));
            expect(errors).toEqual([]);
        }
    });

    test('Mixed managed + serverless deployment has no errors', () => {
        const composer = createNagApp({
            clusters: [
                {
                    clusterId: 'managed',
                    clusterType: 'OPENSEARCH_MANAGED_SERVICE',
                    nodeToNodeEncryption: true,
                    encryptionAtRestEnabled: true,
                    enforceHTTPS: true,
                    ebsEnabled: true,
                },
                {
                    clusterId: 'serverless',
                    clusterType: 'OPENSEARCH_SERVERLESS',
                    collectionType: 'VECTORSEARCH',
                },
            ],
        });

        for (const stack of composer.stacks) {
            const annotations = Annotations.fromStack(stack);
            const errors = annotations.findError('*', Match.stringLikeRegexp('.*'));
            expect(errors).toEqual([]);
        }
    });
});
