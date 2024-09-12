import { Construct } from "constructs";
import * as dms from "aws-cdk-lib/aws-dms";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";

// WARNING - Ensure that the locationReplication stack is created before this stack
export class locationDevReplication extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // get location dev RDS secret from secret manager
    // this secret is a copy of the one in data-dev account
    // TODO: use data-dev account secret directly (requires cross-account permissions)
    const secret = sm.Secret.fromSecretAttributes(this, "ImportedSecret", {
      secretCompleteArn:
        "arn:aws:secretsmanager:us-east-1:124569967017:secret:locationsDevDB-UlV821"
    });

    const sourceEndpoint = new dms.CfnEndpoint(this, "SourceEndpoint", {
      endpointIdentifier: "location-dev-source",
      endpointType: "source",
      engineName: "mysql",
      username: secret.secretValueFromJson("username").unsafeUnwrap(), // Retrieve username from secret
      password: secret.secretValueFromJson("password").unsafeUnwrap(), // Retrieve password from secret
      serverName: secret.secretValueFromJson("host").unsafeUnwrap(), // Retrieve host from secret
      port: parseInt(secret.secretValueFromJson("port").unsafeUnwrap()) || 3306, // Retrieve port from secret
      databaseName: secret.secretValueFromJson("dbname").unsafeUnwrap() // Retrieve database name from secret
    });

    // Create the log group
    const logGroup = new logs.LogGroup(this, "DMSLogGroup", {
      logGroupName: "dms-tasks-locations-dev-replica",
      removalPolicy: cdk.RemovalPolicy.DESTROY // Change as needed
    });

    const replicationTask = new dms.CfnReplicationTask(
      this,
      "ReplicationTask",
      {
        replicationTaskIdentifier: "locations-dev-replication-task",
        tableMappings: JSON.stringify({
          rules: [
            {
              "rule-type": "selection",
              "rule-id": "1726166281",
              "rule-name": "rename-index-1726166281",
              "object-locator": {
                "schema-name": "dev-loc",
                "table-name": "locations"
              },
              "rule-action": "include",
              filters: []
            },
            {
              "rule-type": "transformation",
              "rule-id": "1726166282",
              "rule-name": "prefix-index-1726166282",
              "rule-target": "table",
              "object-locator": {
                "schema-name": "dev-loc",
                "table-name": "locations"
              },
              "rule-action": "rename",
              value: "dev-locations"
            },
            {
              "rule-type": "transformation",
              "rule-id": "1726166283",
              "rule-name": "remove-column-1726166283",
              "rule-target": "column",
              "object-locator": {
                "schema-name": "dev-loc",
                "table-name": "locations",
                "column-name": "meta"
              },
              "rule-action": "remove-column",
              value: null,
              "old-value": null
            }
          ]
        }),
        migrationType: "full-load-and-cdc",
        sourceEndpointArn: sourceEndpoint.ref,
        targetEndpointArn:
          "arn:aws:dms:us-east-1:124569967017:endpoint:ZWVEHYYBONAZJGTF3DXETLZUK4", //TODO: PUT INTO CONFIG
        replicationInstanceArn:
          "arn:aws:dms:us-east-1:124569967017:rep:OCY47FXCQ5E4BDVS7AMW3HEF7A", //TODO: PUT INTO CONFIG
        replicationTaskSettings: JSON.stringify({
          Logging: {
            EnableLogging: true,
            LogComponents: [
              {
                Id: "TRANSFORMATION",
                Severity: "LOGGER_SEVERITY_DEFAULT"
              },
              {
                Id: "SOURCE_UNLOAD",
                Severity: "LOGGER_SEVERITY_DEFAULT"
              },
              {
                Id: "TARGET_LOAD",
                Severity: "LOGGER_SEVERITY_DEFAULT"
              },
              {
                Id: "PERFORMANCE",
                Severity: "LOGGER_SEVERITY_DEFAULT"
              }
            ]
          }
        })
      }
    );

    replicationTask.node.addDependency(logGroup);
  }
}
