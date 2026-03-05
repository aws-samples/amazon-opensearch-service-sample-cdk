import {Construct} from "constructs";
import {CfnOutput, RemovalPolicy, Stack, StackProps} from "aws-cdk-lib";
import {
    CfnAccessPolicy,
    CfnCollection,
    CfnSecurityPolicy,
} from "aws-cdk-lib/aws-opensearchserverless";
import {ServerlessClusterConfig} from "./components/cluster-config";

export interface ServerlessCollectionStackProps extends StackProps {
    readonly stage: string;
    readonly config: ServerlessClusterConfig;
}

export class ServerlessCollectionStack extends Stack {

    constructor(scope: Construct, id: string, props: ServerlessCollectionStackProps) {
        super(scope, id, props);

        const { config, stage } = props;

        const collectionType = config.collectionType ?? 'SEARCH';
        const validTypes = ['SEARCH', 'TIMESERIES', 'VECTORSEARCH'];
        if (!validTypes.includes(collectionType)) {
            throw new Error(
                `Invalid 'collectionType' for cluster '${config.clusterId}': '${collectionType}'. ` +
                `Valid options are: ${validTypes.join(', ')}`
            );
        }

        const standbyReplicas = config.standbyReplicas ?? 'ENABLED';
        if (!['ENABLED', 'DISABLED'].includes(standbyReplicas)) {
            throw new Error(
                `Invalid 'standbyReplicas' for cluster '${config.clusterId}': '${standbyReplicas}'. ` +
                `Valid options are: ENABLED, DISABLED`
            );
        }

        // Encryption policy — required before collection creation
        const encryptionPolicy = new CfnSecurityPolicy(this, 'EncryptionPolicy', {
            name: `${config.clusterName}-enc`,
            type: 'encryption',
            policy: JSON.stringify({
                Rules: [{
                    ResourceType: 'collection',
                    Resource: [`collection/${config.clusterName}`],
                }],
                AWSOwnedKey: true,
            }),
        });

        // Network policy — public access or VPC endpoint restricted
        const networkPolicyRules = [{
            ResourceType: 'collection',
            Resource: [`collection/${config.clusterName}`],
        }, {
            ResourceType: 'dashboard',
            Resource: [`collection/${config.clusterName}`],
        }];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const networkPolicyEntry: Record<string, any> = { Rules: networkPolicyRules };
        if (config.vpcEndpointId) {
            networkPolicyEntry.AllowFromPublic = false;
            networkPolicyEntry.SourceVPCEs = [config.vpcEndpointId];
        } else {
            networkPolicyEntry.AllowFromPublic = true;
        }

        const networkPolicy = new CfnSecurityPolicy(this, 'NetworkPolicy', {
            name: `${config.clusterName}-net`,
            type: 'network',
            policy: JSON.stringify([networkPolicyEntry]),
        });

        const collection = new CfnCollection(this, 'Collection', {
            name: config.clusterName,
            type: collectionType,
            standbyReplicas: standbyReplicas,
        });

        collection.addDependency(encryptionPolicy);
        collection.addDependency(networkPolicy);

        if (config.domainRemovalPolicy === RemovalPolicy.DESTROY) {
            collection.applyRemovalPolicy(RemovalPolicy.DESTROY);
        }

        // Data access policy — grant the deploying account full access
        new CfnAccessPolicy(this, 'DataAccessPolicy', {
            name: `${config.clusterName}-access`,
            type: 'data',
            policy: JSON.stringify([{
                Rules: [{
                    ResourceType: 'collection',
                    Resource: [`collection/${config.clusterName}`],
                    Permission: [
                        'aoss:CreateCollectionItems',
                        'aoss:DeleteCollectionItems',
                        'aoss:UpdateCollectionItems',
                        'aoss:DescribeCollectionItems',
                    ],
                }, {
                    ResourceType: 'index',
                    Resource: [`index/${config.clusterName}/*`],
                    Permission: [
                        'aoss:CreateIndex',
                        'aoss:DeleteIndex',
                        'aoss:UpdateIndex',
                        'aoss:DescribeIndex',
                        'aoss:ReadDocument',
                        'aoss:WriteDocument',
                    ],
                }],
                Principal: [`arn:${this.partition}:iam::${this.account}:root`],
            }]),
        });

        new CfnOutput(this, `CollectionEndpointExport-${stage}-${config.clusterId}`, {
            exportName: `CollectionEndpoint-${stage}-${config.clusterId}`,
            value: collection.attrCollectionEndpoint,
            description: 'The endpoint URL of the serverless collection',
        });

        new CfnOutput(this, `CollectionArnExport-${stage}-${config.clusterId}`, {
            exportName: `CollectionArn-${stage}-${config.clusterId}`,
            value: collection.attrArn,
            description: 'The ARN of the serverless collection',
        });
    }
}
