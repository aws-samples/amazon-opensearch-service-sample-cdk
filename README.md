# AWS Cluster Creation CDK

This repo contains an IaC CDK solution for deploying an OpenSearch Service Domain. Users have the ability to easily deploy their Domain using default values or provide [configuration options](#Configuration-Options) for a more customized setup. The goal of this repo is not to become a one-size-fits-all solution for users. Supporting this would be unrealistic, and likely conflicting at times, when considering the needs of many users. Rather this code base should be viewed as a starting point for users to use and add to individually as their custom use case requires.

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

Create a `cdk.context.json` with your desired cluster configuration. See the sample context file that follows.
```json
{
  "stage": "dev",
  "clusters": []
}
```

Deploy the Cloudformation stacks with the `cdk` CLI
```shell
cdk deploy "*"
```


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
Or to remove an individual stack we can execute
```
cdk destroy openSearchDomainStack
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
