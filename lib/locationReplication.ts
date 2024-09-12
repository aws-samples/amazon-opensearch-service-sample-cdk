import { Construct } from "constructs";
import * as dms from "aws-cdk-lib/aws-dms";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";

export class locationReplication extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create a subnet group for

    const replicationInstance = new dms.CfnReplicationInstance(
      this,
      "ReplicationInstance",
      {
        replicationInstanceIdentifier: "locations-prod-replica",
        replicationInstanceClass: "dms.t3.small",
        publiclyAccessible: true,
        vpcSecurityGroupIds: ["sg-08371b3f90332b39f"], // TODO: PUT INTO CONFIG
        availabilityZone: "us-east-1a",
        replicationSubnetGroupIdentifier: "prodsubnetgroup"
      }
    );
    // get secret from secret manager arn arn:aws:secretsmanager:us-east-1:124569967017:secret:locationDBSecretB06A5C46-tXBWnALn3J4O-RBRLqM

    const secret = sm.Secret.fromSecretAttributes(this, "ImportedSecret", {
      secretCompleteArn:
        "arn:aws:secretsmanager:us-east-1:124569967017:secret:locationDBSecretB06A5C46-tXBWnALn3J4O-RBRLqM" //TODO: PUT INTO CONFIG
    });

    const sourceEndpoint = new dms.CfnEndpoint(this, "SourceEndpoint", {
      endpointIdentifier: "location-prod-source",
      endpointType: "source",
      engineName: "mysql",
      username: secret.secretValueFromJson("username").unsafeUnwrap(), // Retrieve username from secret
      password: secret.secretValueFromJson("password").unsafeUnwrap(), // Retrieve password from secret
      serverName: secret.secretValueFromJson("host").unsafeUnwrap(), // Retrieve host from secret
      port: parseInt(secret.secretValueFromJson("port").unsafeUnwrap()) || 3306, // Retrieve port from secret
      databaseName: secret.secretValueFromJson("dbname").unsafeUnwrap() // Retrieve database name from secret
    });

    // WARN:     "UseNewMappingType": true isnt supported in the CDK you must manually add it to create indexes

    const targetEndpoint = new dms.CfnEndpoint(this, "TargetEndpoint", {
      endpointIdentifier: "opensearch-target",
      endpointType: "target",
      engineName: "opensearch",
      elasticsearchSettings: {
        endpointUri:
          "https://search-opensearch-prod-dt7sf4dduxyhwmyhlxs57ua2sy.us-east-1.es.amazonaws.com",
        serviceAccessRoleArn: "arn:aws:iam::124569967017:role/LocationDMSRole"
      }
    });

    // Create the log group
    const logGroup = new logs.LogGroup(this, "DMSLogGroup", {
      logGroupName: "dms-tasks-locations-prod-replica",
      removalPolicy: cdk.RemovalPolicy.DESTROY // Change as needed
    });

    const replicationTask = new dms.CfnReplicationTask(
      this,
      "ReplicationTask",
      {
        // replicationTaskIdentifier: "locations-rds-to-opensearch",
        tableMappings: `{
    "rules": [
        {
            "rule-type": "transformation",
            "rule-id": "607925872",
            "rule-name": "607925872",
            "rule-target": "column",
            "object-locator": {
                "schema-name": "%",
                "table-name": "%",
                "column-name": "meta"
            },
            "rule-action": "remove-column",
            "value": null,
            "old-value": null
        },
        {
            "rule-type": "selection",
            "rule-id": "607905205",
            "rule-name": "607905205",
            "object-locator": {
                "schema-name": "locations",
                "table-name": "locations"
            },
            "rule-action": "include",
            "filters": []
        }
    ]
}`,
        migrationType: "full-load-and-cdc",
        sourceEndpointArn: sourceEndpoint.ref,
        targetEndpointArn: targetEndpoint.ref,
        replicationInstanceArn: replicationInstance.ref,
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
    replicationTask.node.addDependency(replicationInstance);
    replicationTask.node.addDependency(logGroup);
  }
}
