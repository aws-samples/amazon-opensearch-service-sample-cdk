# AWS OpenSearch Service CDK

CDK infrastructure for deploying OpenSearch Service domains and serverless collections to AWS. Supports multi-cluster deployments, VPC-based networking, and configurable security/storage options.

> **Upgrading from 0.1.x?** See the [v0.1.10 README](https://github.com/aws-samples/amazon-opensearch-service-sample-cdk/blob/v0.1.10/README.md) for the previous API. Key breaking changes in 0.2.x:
> - `StackPropsExt` removed — stacks use inline `stage` prop
> - `createOpenSearchStack`/`createServerlessStack` factory functions removed
> - `VpcDetails` is now immutable with static factory methods
> - NetworkStack only created when managed clusters need it

## Quick Start

```bash
npm install
cdk bootstrap  # first time only
```

Create a context file (e.g. `my-cluster.json`):
```json
{
  "stage": "dev",
  "vpcAZCount": 2,
  "clusters": [
    {
      "clusterId": "app-logs",
      "clusterVersion": "OS_2.19",
      "clusterType": "OPENSEARCH_MANAGED_SERVICE"
    }
  ]
}
```

Deploy:
```bash
cdk deploy "*" --context contextFile=my-cluster.json --require-approval never --concurrency 3
```

## Multi-Cluster Deployments

Deploy multiple clusters (managed + serverless) from a single config:

```json
{
  "stage": "prod",
  "vpcAZCount": 3,
  "clusters": [
    {
      "clusterId": "search",
      "clusterType": "OPENSEARCH_MANAGED_SERVICE",
      "clusterVersion": "OS_2.19",
      "dataNodeType": "r6g.xlarge.search",
      "dataNodeCount": 6,
      "dedicatedManagerNodeType": "m6g.large.search",
      "dedicatedManagerNodeCount": 3,
      "ebsEnabled": true,
      "ebsVolumeSize": 500,
      "ebsVolumeType": "GP3",
      "ebsThroughput": 250,
      "nodeToNodeEncryption": true,
      "domainRemovalPolicy": "RETAIN"
    },
    {
      "clusterId": "logs",
      "clusterType": "OPENSEARCH_MANAGED_SERVICE",
      "clusterVersion": "OS_2.19",
      "dataNodeType": "r6g.2xlarge.search",
      "dataNodeCount": 6,
      "ebsEnabled": true,
      "ebsVolumeSize": 2048,
      "domainRemovalPolicy": "RETAIN"
    },
    {
      "clusterId": "vectors",
      "clusterType": "OPENSEARCH_SERVERLESS",
      "collectionType": "VECTORSEARCH",
      "standbyReplicas": "ENABLED"
    }
  ]
}
```

This creates:
- 1 shared VPC (NetworkStack) — used by both managed clusters
- 2 managed OpenSearch domains (search + logs)
- 1 serverless collection (vectors) — no VPC needed

## Serverless Collections

Deploy an OpenSearch Serverless collection without any VPC:

```json
{
  "stage": "dev",
  "clusters": [
    {
      "clusterId": "search",
      "clusterType": "OPENSEARCH_SERVERLESS",
      "collectionType": "SEARCH",
      "standbyReplicas": "DISABLED",
      "domainRemovalPolicy": "DESTROY"
    }
  ]
}
```

Collection types: `SEARCH`, `TIMESERIES`, `VECTORSEARCH`

## Deploy Without CDK (CloudFormation Templates)

Each [GitHub Release](https://github.com/aws-samples/amazon-opensearch-service-sample-cdk/releases) includes pre-synthesized CloudFormation templates:

```bash
# 1. Deploy the VPC
aws cloudformation create-stack \
  --stack-name opensearch-network \
  --template-body file://cfn-NetworkStack.min.json \
  --parameters ParameterKey=Stage,ParameterValue=prod

# 2. Get outputs
SUBNETS=$(aws cloudformation describe-stacks --stack-name opensearch-network \
  --query 'Stacks[0].Outputs[?OutputKey==`PrivateSubnetIds`].OutputValue' --output text)
SG=$(aws cloudformation describe-stacks --stack-name opensearch-network \
  --query 'Stacks[0].Outputs[?OutputKey==`SecurityGroupId`].OutputValue' --output text)

# 3. Deploy the domain
aws cloudformation create-stack \
  --stack-name opensearch-domain \
  --template-body file://cfn-OpenSearchDomainStack.min.json \
  --parameters \
    ParameterKey=Stage,ParameterValue=prod \
    ParameterKey=SubnetIds,ParameterValue="$SUBNETS" \
    ParameterKey=SecurityGroupId,ParameterValue="$SG" \
    ParameterKey=DataNodeInstanceType,ParameterValue=r6g.xlarge.search \
    ParameterKey=EBSVolumeSize,ParameterValue=200
```

## Configuration Reference

### General Options

| Name     | Type   | Example | Description |
|----------|--------|---------|:------------|
| stage    | string | "dev"   | **Required.** Environment name (max 15 chars) |
| clusters | array  | See above | Array of cluster configurations |

### VPC Options

| Name       | Type   | Example                 | Description |
|------------|--------|-------------------------|:------------|
| vpcId      | string | "vpc-123456789abcdefgh" | Use an existing VPC instead of creating one |
| vpcAZCount | number | 2                       | AZ count for created VPC (1-3). Incompatible with `vpcId` |
| vpcCidr    | string | "10.212.0.0/16"         | CIDR for created VPC. Incompatible with `vpcId` |

### Cluster Options (all types)

| Name                    | Type     | Example                        | Description |
|-------------------------|----------|--------------------------------|:------------|
| clusterId               | string   | "payment-search"               | **Required.** Unique identifier (max 15 chars) |
| clusterType             | string   | "OPENSEARCH_MANAGED_SERVICE"   | **Required.** `OPENSEARCH_MANAGED_SERVICE` or `OPENSEARCH_SERVERLESS` |
| clusterName             | string   | "my-domain"                    | Custom name (default: `cluster-<stage>-<clusterId>`) |
| domainRemovalPolicy     | string   | "DESTROY"                      | `RETAIN` (default) or `DESTROY` |

### Managed Domain Options

| Name | Type | Default | Description |
|------|------|---------|:------------|
| clusterVersion | string | OS_2.19 | Engine version (`OS_x.y` or `ES_x.y`) |
| clusterSubnetIds | string[] | — | Subnet IDs for imported VPC |
| clusterSecurityGroupIds | string[] | — | Security group IDs for imported VPC |
| dataNodeType | string | — | Data node instance type |
| dataNodeCount | number | AZ count | Number of data nodes |
| dedicatedManagerNodeType | string | — | Manager node instance type |
| dedicatedManagerNodeCount | number | — | Number of manager nodes |
| warmNodeType | string | — | Warm node instance type |
| warmNodeCount | number | — | Number of warm nodes |
| ebsEnabled | boolean | — | Attach EBS volumes |
| ebsVolumeSize | number | — | EBS volume size (GiB) |
| ebsVolumeType | string | GP3 | EBS volume type |
| ebsIops | number | — | IOPS (GP3/IO1/IO2 only) |
| ebsThroughput | number | — | Throughput MiB/s (GP3 only) |
| encryptionAtRestEnabled | boolean | true | Encrypt data at rest |
| encryptionAtRestKmsKeyARN | string | — | KMS key ARN |
| nodeToNodeEncryptionEnabled | boolean | true | Node-to-node encryption |
| enforceHTTPS | boolean | true | Require HTTPS |
| tlsSecurityPolicy | string | TLS_1_2 | Minimum TLS version |
| openAccessPolicyEnabled | boolean | false | Open access policy |
| accessPolicies | object | — | IAM access policies |
| useUnsignedBasicAuth | boolean | false | Unsigned basic auth |
| fineGrainedManagerUserARN | string | — | Manager user IAM ARN |
| fineGrainedManagerUserSecretARN | string | — | Manager user secret ARN |
| enableDemoAdmin | boolean | false | Demo admin credentials |
| loggingAppLogEnabled | boolean | — | Application logging |
| loggingAppLogGroupARN | string | — | CloudWatch log group ARN |

### Serverless Collection Options

| Name | Type | Default | Description |
|------|------|---------|:------------|
| collectionType | string | SEARCH | `SEARCH`, `TIMESERIES`, or `VECTORSEARCH` |
| standbyReplicas | string | ENABLED | `ENABLED` or `DISABLED` |

### Context Precedence

1. CDK CLI context (`-c stage=dev2`) — highest
2. Context file (`--context contextFile=my-cluster.json`)
3. `cdk.context.json`
4. `default-values.json` / `default-cluster-values.json`

## VPC Mismatch Protection

OpenSearch domains cannot be moved between VPCs. If the NetworkStack is recreated with a new VPC while an existing domain remains in the old VPC, the deployment fails early with a clear error:

```
VPC mismatch: OpenSearch domain 'my-domain' exists in VPC vpc-old123 but the deployment
targets VPC vpc-new456. Delete the existing domain stack first, then redeploy.
```

## Releasing

Automated via GitHub Actions:

**One-click:** Actions → "Version Bump" → Run workflow → select `patch`/`minor`/`prerelease`

**Manual:**
```bash
npm version patch
git push origin main --follow-tags
```

Each release includes:
- `opensearch-service-domain-cdk-<version>.tgz` — npm package
- `cfn-NetworkStack.min.json` — CloudFormation template
- `cfn-OpenSearchDomainStack.min.json` — CloudFormation template

## Tearing Down

```bash
cdk destroy "*"
```

Note: Default `domainRemovalPolicy` is `RETAIN`. Set to `DESTROY` to delete domains on stack deletion.

## Development

```bash
npm run build    # compile TypeScript
npm run test     # lint + jest
npm run watch    # watch mode
cdk synth        # synthesize CloudFormation
cdk diff         # compare with deployed
```
