#!/usr/bin/env node
import "source-map-support/register";
import { App, Tags } from "aws-cdk-lib";
import { StackComposer } from "../lib/stack-composer";
import { locationReplication } from "../lib/locationReplication";
import { locationDevReplication } from "../lib/locationDevReplication";

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;
const stage = process.env.CDK_DEPLOYMENT_STAGE;
if (!stage) {
  throw new Error(
    "Required environment variable CDK_DEPLOYMENT_STAGE has not been set (i.e. dev, gamma, PROD)"
  );
}

new StackComposer(app, {
  env: { account: account, region: region },
  stage: stage
});

new locationReplication(app, "locationReplication", {
  env: { account: account, region: region }
});

const locationDevReplicationStack = new locationDevReplication(
  app,
  "locationDevReplication",
  {
    env: { account: account, region: region }
  }
);
Tags.of(locationDevReplicationStack).add("product", "OpenSearch");
