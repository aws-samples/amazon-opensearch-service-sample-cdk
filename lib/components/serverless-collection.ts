import {CfnOutput, RemovalPolicy, Stack} from "aws-cdk-lib";
import {
    CfnAccessPolicy,
    CfnCollection,
    CfnSecurityPolicy,
} from "aws-cdk-lib/aws-opensearchserverless";
import {ServerlessClusterConfig} from "./cluster-config";

/**
 * Creates serverless OpenSearch collections within the given stack.
 * This is a helper function, not a separate stack — all resources
 * are created in the caller's stack scope.
 */
export function createServerlessCollection(stack: Stack, config: ServerlessClusterConfig, stage: string): void {
    const prefix = config.clusterId;

    // Build the list of collections to create.
    const entries: { name: string; type: string }[] = [];
    if (config.collections && config.collections.length > 0) {
        for (const c of config.collections) {
            if (!c.collectionName) {
                throw new Error(`Each entry in 'collections' for cluster '${config.clusterId}' must have a 'collectionName'`);
            }
            entries.push({
                name: c.collectionName,
                type: validateCollectionType(c.collectionType ?? config.collectionType ?? 'SEARCH', config.clusterId),
            });
        }
    } else {
        entries.push({
            name: config.clusterName,
            type: validateCollectionType(config.collectionType ?? 'SEARCH', config.clusterId),
        });
    }

    const standbyReplicas = config.standbyReplicas ?? 'ENABLED';
    if (!['ENABLED', 'DISABLED'].includes(standbyReplicas)) {
        throw new Error(
            `Invalid 'standbyReplicas' for cluster '${config.clusterId}': '${standbyReplicas}'. ` +
            `Valid options are: ENABLED, DISABLED`
        );
    }

    // Shared encryption policy covering all collections in the group
    const collectionResources = entries.map(e => `collection/${e.name}`);
    const encryptionPolicy = new CfnSecurityPolicy(stack, `${prefix}-EncryptionPolicy`, {
        name: `${config.clusterName}-enc`,
        type: 'encryption',
        policy: JSON.stringify({
            Rules: [{ResourceType: 'collection', Resource: collectionResources}],
            AWSOwnedKey: true,
        }),
    });

    // Shared network policy
    const networkPolicyRules = [
        {ResourceType: 'collection', Resource: collectionResources},
        {ResourceType: 'dashboard', Resource: collectionResources},
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const networkPolicyEntry: Record<string, any> = {Rules: networkPolicyRules};
    if (config.vpcEndpointId) {
        networkPolicyEntry.AllowFromPublic = false;
        networkPolicyEntry.SourceVPCEs = [config.vpcEndpointId];
    } else if (config.sourceIPAddresses && config.sourceIPAddresses.length > 0) {
        networkPolicyEntry.AllowFromPublic = false;
        networkPolicyEntry.SourceIPAddresses = config.sourceIPAddresses;
    } else {
        networkPolicyEntry.AllowFromPublic = true;
    }

    const networkPolicy = new CfnSecurityPolicy(stack, `${prefix}-NetworkPolicy`, {
        name: `${config.clusterName}-net`,
        type: 'network',
        policy: JSON.stringify([networkPolicyEntry]),
    });

    // Create each collection
    for (const entry of entries) {
        const collectionId = entries.length > 1 ? `${prefix}-${entry.name}` : prefix;

        const collection = new CfnCollection(stack, `${collectionId}-Collection`, {
            name: entry.name,
            type: entry.type,
            standbyReplicas: standbyReplicas,
        });

        collection.addDependency(encryptionPolicy);
        collection.addDependency(networkPolicy);

        if (config.domainRemovalPolicy === RemovalPolicy.DESTROY) {
            collection.applyRemovalPolicy(RemovalPolicy.DESTROY);
        }

        new CfnOutput(stack, `CollectionEndpointExport-${stage}-${collectionId}`, {
            exportName: `CollectionEndpoint-${stage}-${collectionId}`,
            value: collection.attrCollectionEndpoint,
            description: `The endpoint URL of the ${entry.name} serverless collection`,
        });

        new CfnOutput(stack, `CollectionArnExport-${stage}-${collectionId}`, {
            exportName: `CollectionArn-${stage}-${collectionId}`,
            value: collection.attrArn,
            description: `The ARN of the ${entry.name} serverless collection`,
        });
    }

    // Shared data access policy covering all collections
    const indexResources = entries.map(e => `index/${e.name}/*`);
    new CfnAccessPolicy(stack, `${prefix}-DataAccessPolicy`, {
        name: `${config.clusterName}-access`,
        type: 'data',
        policy: JSON.stringify([{
            Rules: [{
                ResourceType: 'collection',
                Resource: collectionResources,
                Permission: [
                    'aoss:CreateCollectionItems', 'aoss:DeleteCollectionItems',
                    'aoss:UpdateCollectionItems', 'aoss:DescribeCollectionItems',
                ],
            }, {
                ResourceType: 'index',
                Resource: indexResources,
                Permission: [
                    'aoss:CreateIndex', 'aoss:DeleteIndex', 'aoss:UpdateIndex',
                    'aoss:DescribeIndex', 'aoss:ReadDocument', 'aoss:WriteDocument',
                ],
            }],
            Principal: config.dataAccessPrincipals ?? [`arn:${stack.partition}:iam::${stack.account}:root`],
        }]),
    });
}

function validateCollectionType(collectionType: string, clusterId: string): string {
    const validTypes = ['SEARCH', 'TIMESERIES', 'VECTORSEARCH'];
    if (!validTypes.includes(collectionType)) {
        throw new Error(
            `Invalid 'collectionType' for cluster '${clusterId}': '${collectionType}'. ` +
            `Valid options are: ${validTypes.join(', ')}`
        );
    }
    return collectionType;
}
