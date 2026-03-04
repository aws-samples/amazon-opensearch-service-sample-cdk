import {Construct} from "constructs";
import {CfnOutput, RemovalPolicy, Stack} from "aws-cdk-lib";
import {
    CfnAccessPolicy,
    CfnCollection,
    CfnSecurityPolicy,
} from "aws-cdk-lib/aws-opensearchserverless";
import {StackPropsExt} from "./stack-composer";
import {ClusterConfig} from "./components/cluster-config";
import {Environment} from "aws-cdk-lib/core/lib/environment";

export interface ServerlessCollectionStackProps extends StackPropsExt {
    readonly collectionName: string;
    readonly clusterId: string;
    readonly collectionType?: string;
    readonly standbyReplicas?: string;
    readonly domainRemovalPolicy?: RemovalPolicy;
}

export class ServerlessCollectionStack extends Stack {

    constructor(scope: Construct, id: string, props: ServerlessCollectionStackProps) {
        super(scope, id, props);

        const collectionType = props.collectionType ?? 'SEARCH';
        const validTypes = ['SEARCH', 'TIMESERIES', 'VECTORSEARCH'];
        if (!validTypes.includes(collectionType)) {
            throw new Error(
                `Invalid 'collectionType' for cluster '${props.clusterId}': '${collectionType}'. ` +
                `Valid options are: ${validTypes.join(', ')}`
            );
        }

        const standbyReplicas = props.standbyReplicas ?? 'ENABLED';
        if (!['ENABLED', 'DISABLED'].includes(standbyReplicas)) {
            throw new Error(
                `Invalid 'standbyReplicas' for cluster '${props.clusterId}': '${standbyReplicas}'. ` +
                `Valid options are: ENABLED, DISABLED`
            );
        }

        // Encryption policy — required before collection creation
        const encryptionPolicy = new CfnSecurityPolicy(this, 'EncryptionPolicy', {
            name: `${props.collectionName}-enc`,
            type: 'encryption',
            policy: JSON.stringify({
                Rules: [{
                    ResourceType: 'collection',
                    Resource: [`collection/${props.collectionName}`],
                }],
                AWSOwnedKey: true,
            }),
        });

        // Network policy — public access (VPC endpoints can be configured separately)
        const networkPolicy = new CfnSecurityPolicy(this, 'NetworkPolicy', {
            name: `${props.collectionName}-net`,
            type: 'network',
            policy: JSON.stringify([{
                Rules: [{
                    ResourceType: 'collection',
                    Resource: [`collection/${props.collectionName}`],
                }, {
                    ResourceType: 'dashboard',
                    Resource: [`collection/${props.collectionName}`],
                }],
                AllowFromPublic: true,
            }]),
        });

        const collection = new CfnCollection(this, 'Collection', {
            name: props.collectionName,
            type: collectionType,
            standbyReplicas: standbyReplicas,
        });

        collection.addDependency(encryptionPolicy);
        collection.addDependency(networkPolicy);

        if (props.domainRemovalPolicy === RemovalPolicy.DESTROY) {
            collection.applyRemovalPolicy(RemovalPolicy.DESTROY);
        }

        // Data access policy — grant the deploying account full access
        new CfnAccessPolicy(this, 'DataAccessPolicy', {
            name: `${props.collectionName}-access`,
            type: 'data',
            policy: JSON.stringify([{
                Rules: [{
                    ResourceType: 'collection',
                    Resource: [`collection/${props.collectionName}`],
                    Permission: [
                        'aoss:CreateCollectionItems',
                        'aoss:DeleteCollectionItems',
                        'aoss:UpdateCollectionItems',
                        'aoss:DescribeCollectionItems',
                    ],
                }, {
                    ResourceType: 'index',
                    Resource: [`index/${props.collectionName}/*`],
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

        new CfnOutput(this, `CollectionEndpointExport-${props.stage}-${props.clusterId}`, {
            exportName: `CollectionEndpoint-${props.stage}-${props.clusterId}`,
            value: collection.attrCollectionEndpoint,
            description: 'The endpoint URL of the serverless collection',
        });

        new CfnOutput(this, `CollectionArnExport-${props.stage}-${props.clusterId}`, {
            exportName: `CollectionArn-${props.stage}-${props.clusterId}`,
            value: collection.attrArn,
            description: 'The ARN of the serverless collection',
        });
    }
}

export function createServerlessStack(scope: Construct, config: ClusterConfig, stage: string, region: string, env?: Environment): Stack {
    return new ServerlessCollectionStack(scope, `serverlessCollectionStack-${config.clusterId}`, {
        collectionName: config.clusterName,
        clusterId: config.clusterId,
        collectionType: config.collectionType,
        standbyReplicas: config.standbyReplicas,
        domainRemovalPolicy: config.domainRemovalPolicy,
        stackName: `OpenSearchServerless-${config.clusterId}-${stage}-${region}`,
        description: 'This stack contains resources to create/manage an OpenSearch Serverless collection',
        stage,
        env: env,
    });
}
