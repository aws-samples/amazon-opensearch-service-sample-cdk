# AWS Cluster Creation CDK

This repo contains a CDK solution for deploying OpenSearch and Elasticsearch clusters to AWS

## Getting Started

### Project required setup

1- It is necessary to run `npm install` within this current directory to install required packages that this app and CDK need for operation.

2- Configure the desired **[AWS credentials](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_prerequisites)**, as these will dictate the region and account used for deployment.

### First time using CDK in this region?

If this is your first experience with CDK, follow the steps below to get started:

1- Install the **CDK CLI** tool, if you haven't already, by running:
```shell
npm install -g aws-cdk
```

2- **Bootstrap CDK**: if you have not run CDK previously in the configured region of you account, it is necessary to run the following command from the same directory as this README to set up a small CloudFormation stack of resources that CDK needs to function within your account

```shell
cdk bootstrap
```

## Deploying the CDK

Create a `cdk.context.json` with your desired cluster configuration. See the sample context file that follows, which creates a VPC and a OpenSearch Domain.
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

Deploy the Cloudformation stacks with the CDK CLI
```shell
cdk deploy "*" --require-approval never --concurrency 3
```

## Configuration Options

### General Options

| Name     | Type   | Example                 | Description                                                                       |
|----------|--------|-------------------------|:----------------------------------------------------------------------------------|
| stage    | string | "dev"                   | **Required.** The environment name to use for labelling of resources              |
| clusters | JSON   | See `Deploying the CDK` | JSON array of `cluster` objects, where each object represents a cluster to deploy |

### VPC Options

| Name         | Type         | Example                                                  | Description                                                                                                                                                                                |
|--------------|--------------|----------------------------------------------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| vpcId        | string       | "vpc-123456789abcdefgh"                                  | Specify an existing VPC to deploy clusters into                                                                                                                                            |
| vpcAZCount   | number       | 2                                                        | The number of Availability Zones to use for a created VPC. One public and one private subnet will be created for each AZ. This option should not be provided for imported VPCs via `vpcId` |

### General Cluster Options

| Name                    | Type         | Example                                                  | Description                                                                                                 |
|-------------------------|--------------|----------------------------------------------------------|:------------------------------------------------------------------------------------------------------------|
| clusterId               | string       | "payment-search"                                         | **Required.** Unique ID to give to cluster. This will be used for resource naming and log references        |
| clusterType             | string       | "OPENSEARCH_MANAGED_SERVICE"                             | **Required.** The type of cluster to deploy                                                                 |
| clusterName             | string       | "search-cluster-dev"                                     | Name to use for the cluster. If not provided the name will default to `cluster-<stage>-<clusterId>`         |
| clusterVersion          | string       | "OS_1.3"                                                 | The Elasticsearch/OpenSearch version that your cluster will leverage. In the format of `OS_x.y` or `ES_x.y` |
| clusterSubnetIds        | string array | ["subnet-123456789abcdefgh", "subnet-223456789abcdefgh"] | Specify the subnet IDs of an imported VPC to place the cluster into. Requires `vpcId` to be specified       |
| clusterSecurityGroupIds | string array | ["sg-123456789abcdefgh", "sg-223456789abcdefgh"]         | Specify the VPC Security Groups that will be associated with the cluster. Requires `vpcId` to be specified  |



### OpenSearch Domain Specific Options

| Name                            | Type         | Example                                                                                                                                                                                                                      | Description                                                                                                                                                                                                                                                         |
|---------------------------------|--------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| dataNodeType                    | string       | "r6g.large.search"                                                                                                                                                                                                           | The instance type for your data nodes. Supported values can be found [here](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/supported-instance-types.html)                                                                                     |
| dataNodeCount                   | number       | 1                                                                                                                                                                                                                            | The number of data nodes to use in the OpenSearch Service Domain                                                                                                                                                                                                    |
| dedicatedManagerNodeType        | string       | "r6g.large.search"                                                                                                                                                                                                           | The instance type for your manager nodes. Supported values can be found [here](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/supported-instance-types.html)                                                                                  |
| dedicatedManagerNodeCount       | number       | 3                                                                                                                                                                                                                            | The number of manager nodes to use in the OpenSearch Service Domain                                                                                                                                                                                                 |
| warmNodeType                    | string       | "ultrawarm1.medium.search"                                                                                                                                                                                                   | The instance type for your warm nodes. Supported values can be found [here](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/limits.html#limits-ultrawarm)                                                                                      |
| warmNodeCount                   | number       | 3                                                                                                                                                                                                                            | The number of warm nodes to use in the OpenSearch Service Domain                                                                                                                                                                                                    |
| accessPolicies                  | JSON         | `{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"arn:aws:iam::12345678912:user/test-user"},"Action":"es:ESHttp*","Resource":"arn:aws:es:us-east-1:12345678912:domain/cdk-os-service-domain/*"}]}` | Domain access policies                                                                                                                                                                                                                                              |
| useUnsignedBasicAuth            | boolean      | false                                                                                                                                                                                                                        | Configures the domain so that unsigned basic auth is enabled                                                                                                                                                                                                        |
| fineGrainedManagerUserARN       | string       | `"arn:aws:iam::12345678912:user/test-user"`                                                                                                                                                                                  | The IAM User ARN of the manager user. <br/>Fine grained access control also requires nodeToNodeEncryptionEnabled and encryptionAtRestEnabled to be enabled. <br/> Either fineGrainedManagerUserARN or fineGrainedManagerUserSecretARN can be enabled, but not both. |
| fineGrainedManagerUserSecretARN | string       | `"arn:aws:secretsmanager:us-east-1:12345678912:secret:opensearch-secret-123abc"`                                                                                                                                             | The AWS Secrets Manager key ARN that will be used to create the manager user. This secret should include two key/value pairs, one for `username` and one for `password`. Should not be used with fineGrainedManagerUserARN                                          |
| enableDemoAdmin                 | boolean      | false                                                                                                                                                                                                                        | Demo mode setting that creates a basic manager user with username: admin and password: myStrongPassword123! . **NOTE**: This should not be used in a production environment and is not compatible with previous fineGrained settings                                |
| enforceHTTPS                    | boolean      | true                                                                                                                                                                                                                         | Require that all traffic to the domain arrive over HTTPS                                                                                                                                                                                                            |
| tlsSecurityPolicy               | string       | "TLS_1_2"                                                                                                                                                                                                                    | The minimum TLS version required for traffic to the domain                                                                                                                                                                                                          |
| ebsEnabled                      | boolean      | true                                                                                                                                                                                                                         | Specify whether Amazon EBS volumes are attached to data nodes. Some instance types (i.e. r6gd) require that EBS be disabled                                                                                                                                         |
| ebsIops                         | number       | 4000                                                                                                                                                                                                                         | The number of I/O operations per second (IOPS) that the volume supports                                                                                                                                                                                             |
| ebsVolumeSize                   | number       | 15                                                                                                                                                                                                                           | The size (in GiB) of the EBS volume for each data node                                                                                                                                                                                                              |
| ebsVolumeType                   | string       | "GP3"                                                                                                                                                                                                                        | The EBS volume type to use with the Amazon OpenSearch Service domain. Supported values can be found [here](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html)                                                                |
| encryptionAtRestEnabled         | boolean      | true                                                                                                                                                                                                                         | Enable Domain to encrypt data at rest                                                                                                                                                                                                                               |
| encryptionAtRestKmsKeyARN       | string       | `"arn:aws:kms:us-east-1:12345678912:key/abc123de-4888-4fa7-a508-3811e2d49fc3"`                                                                                                                                               | Supply the KMS key to use for encryption at rest. If encryptionAtRestEnabled is enabled and this value is not provided, the default KMS key for OpenSearch Service will be used                                                                                     |
| loggingAppLogEnabled            | boolean      | true                                                                                                                                                                                                                         | Specify if Amazon OpenSearch Service application logging should be set up                                                                                                                                                                                           |
| loggingAppLogGroupARN           | string       | `"arn:aws:logs:us-east-1:12345678912:log-group:test-log-group:*"`                                                                                                                                                            | Supply the CloudWatch log group to use for application logging. If not provided and application logs are enabled, a CloudWatch log group will be created                                                                                                            |
| nodeToNodeEncryptionEnabled     | boolean      | true                                                                                                                                                                                                                         | Specify if node to node encryption should be enabled                                                                                                                                                                                                                |
| openAccessPolicyEnabled         | boolean      | false                                                                                                                                                                                                                        | Applies an open access policy to the Domain. **NOTE**: This setting should only be used for Domains placed within a VPC, and is applicable to many use cases where access controlled by Security Groups on the VPC is sufficient.                                   |
| domainRemovalPolicy             | string       | "RETAIN"                                                                                                                                                                                                                     | Policy to apply when the domain is removed from the CloudFormation stack                                                                                                                                                                                            |



### How is the CDK context used in this solution?
This project uses CDK context parameters to configure deployments. These context values will dictate the composition of your stacks as well as which stacks get deployed.

The full list of available configuration options for this project are listed [here](./options.md). Each option can be provided as an empty string `""` or simply not included, and in each of these 'empty' cases the option will use the project default value (if it exists) or CloudFormation's default value.

Depending on your use-case, you may choose to provide options from both the `cdk.context.json` and the CDK CLI, in which case it is important to know the precedence level for context values. The below order shows these levels with values being passed by the CDK CLI having the most importance
1. CDK CLI passed context values, e.g. --c stage=dev2 (highest precedence)
2. Created `cdk.context.json` in the same directory as this README
3. Existing `default-values.json` in the same directory as this README


### Tearing down CDK
To remove all the CDK stack(s) which get created during deployment we can execute
```
cdk destroy "*"
```
Or to remove an individual stack we could execute a command similar to the following
```
cdk destroy openSearchDomainStack-dev-search
```
Note that the default retention policy for the OpenSearch Domain is to RETAIN this resource when the stack is deleted, and in order to delete the Domain on stack deletion the `domainRemovalPolicy` would need to be set to `DESTROY`. Otherwise, the Domain can be manually deleted through the AWS console or through other means such as the AWS CLI.

### Useful CDK commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk ls`          list all stacks in the app
* `cdk deploy "*"`  deploy all stacks to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
