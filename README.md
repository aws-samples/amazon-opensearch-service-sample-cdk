# AWS OpenSearch Service CDK

CDK infrastructure for deploying OpenSearch Service domains to AWS. Supports VPC-based deployments with configurable networking, security, and storage options.

## Quick Start

```bash
npm install
cdk bootstrap  # first time only
```

Create a `cdk.context.json`:
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
cdk deploy "*" --require-approval never --concurrency 3
```

## Deploy Without CDK (CloudFormation Templates)

Each [GitHub Release](https://github.com/aws-samples/amazon-opensearch-service-sample-cdk/releases) includes pre-synthesized CloudFormation templates that can be deployed directly:

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

## Configuration Options

### General Options

| Name     | Type   | Example | Description |
|----------|--------|---------|:------------|
| stage    | string | "dev"   | **Required.** Environment name for resource labelling |
| clusters | JSON   | See above | JSON array of cluster objects |

### VPC Options

| Name       | Type   | Example                 | Description |
|------------|--------|-------------------------|:------------|
| vpcId      | string | "vpc-123456789abcdefgh" | Use an existing VPC instead of creating one |
| vpcAZCount | number | 2                       | Number of AZs for the created VPC (1-3). Not compatible with `vpcId` |
| vpcCidr    | string | "10.212.0.0/16"         | Custom CIDR for the created VPC. Not compatible with `vpcId` |

### Cluster Options

| Name                    | Type         | Example | Description |
|-------------------------|--------------|---------|:------------|
| clusterId               | string       | "payment-search" | **Required.** Unique cluster identifier |
| clusterType             | string       | "OPENSEARCH_MANAGED_SERVICE" | **Required.** Cluster type |
| clusterName             | string       | "search-cluster-dev" | Custom name (defaults to `cluster-<stage>-<clusterId>`) |
| clusterVersion          | string       | "OS_2.19" | Engine version (`OS_x.y` or `ES_x.y`) |
| clusterSubnetIds        | string[]     | ["subnet-abc", "subnet-def"] | Subnet IDs for imported VPC. Requires `vpcId` |
| clusterSecurityGroupIds | string[]     | ["sg-abc"] | Security group IDs. Requires `vpcId` |

### OpenSearch Domain Options

| Name | Type | Default | Description |
|------|------|---------|:------------|
| dataNodeType | string | — | Data node instance type |
| dataNodeCount | number | AZ count | Number of data nodes |
| dedicatedManagerNodeType | string | — | Manager node instance type |
| dedicatedManagerNodeCount | number | — | Number of manager nodes |
| warmNodeType | string | — | Warm node instance type |
| warmNodeCount | number | — | Number of warm nodes |
| ebsEnabled | boolean | — | Attach EBS volumes to data nodes |
| ebsVolumeSize | number | — | EBS volume size (GiB) |
| ebsVolumeType | string | GP3 | EBS volume type |
| ebsIops | number | — | EBS IOPS |
| ebsThroughput | number | — | EBS throughput (MiB/s, GP3 only) |
| encryptionAtRestEnabled | boolean | true | Encrypt data at rest |
| encryptionAtRestKmsKeyARN | string | — | KMS key for encryption at rest |
| nodeToNodeEncryptionEnabled | boolean | true | Node-to-node encryption |
| enforceHTTPS | boolean | true | Require HTTPS |
| tlsSecurityPolicy | string | TLS_1_2 | Minimum TLS version |
| openAccessPolicyEnabled | boolean | false | Open access policy (VPC-only domains) |
| accessPolicies | JSON | — | IAM access policies |
| useUnsignedBasicAuth | boolean | false | Enable unsigned basic auth |
| fineGrainedManagerUserARN | string | — | Manager user IAM ARN |
| fineGrainedManagerUserSecretARN | string | — | Manager user Secrets Manager ARN |
| enableDemoAdmin | boolean | false | Demo admin (admin/myStrongPassword123!) |
| loggingAppLogEnabled | boolean | — | Enable application logging |
| loggingAppLogGroupARN | string | — | CloudWatch log group ARN |
| domainRemovalPolicy | string | RETAIN | Stack deletion policy (RETAIN/DESTROY) |

### Context Precedence

1. CDK CLI context (`-c stage=dev2`) — highest
2. `cdk.context.json` file
3. `default-values.json` defaults

## VPC Mismatch Protection

OpenSearch domains cannot be moved between VPCs. If the NetworkStack is recreated with a new VPC while an existing domain remains in the old VPC, the deployment will fail early with a clear error:

```
VPC mismatch: OpenSearch domain 'my-domain' exists in VPC vpc-old123 but the deployment
targets VPC vpc-new456. OpenSearch domains cannot be moved between VPCs. Delete the
existing domain (and its CloudFormation stack) first, then redeploy.
```

## Releasing

Releases are automated via GitHub Actions:

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

Note: The default `domainRemovalPolicy` is `RETAIN`. Set to `DESTROY` to delete the domain on stack deletion.

## Development

```bash
npm run build    # compile TypeScript
npm run test     # lint + jest
npm run watch    # watch mode
cdk synth        # synthesize CloudFormation
cdk diff         # compare with deployed
```
