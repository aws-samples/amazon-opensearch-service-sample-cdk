import { Template } from "aws-cdk-lib/assertions";
import { createStackComposer } from "./test-utils";
import { describe, test, expect } from '@jest/globals';
import { MonitoringStack } from "../lib/monitoring-stack";
import { ClusterType } from "../lib/components/common-utilities";

describe('MonitoringStack', () => {

  test('creates 7 CloudWatch alarms when monitoring is enabled', () => {
    const stackComposer = createStackComposer({
      monitoringEnabled: true,
      clusters: [{
        clusterId: "monitored",
        clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
      }]
    });

    const monitoringStacks = stackComposer.stacks.filter(s => s instanceof MonitoringStack);
    expect(monitoringStacks.length).toBe(1);

    const template = Template.fromStack(monitoringStacks[0]);
    template.resourceCountIs("AWS::CloudWatch::Alarm", 7);
  });

  test('no monitoring stack when monitoringEnabled is not set', () => {
    const stackComposer = createStackComposer({
      clusters: [{
        clusterId: "nomonitor",
        clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
      }]
    });

    const monitoringStacks = stackComposer.stacks.filter(s => s instanceof MonitoringStack);
    expect(monitoringStacks.length).toBe(0);
  });

  test('no monitoring stack for serverless clusters', () => {
    const stackComposer = createStackComposer({
      monitoringEnabled: true,
      clusters: [{
        clusterId: "serverless",
        clusterType: ClusterType.OPENSEARCH_SERVERLESS,
      }]
    });

    const monitoringStacks = stackComposer.stacks.filter(s => s instanceof MonitoringStack);
    expect(monitoringStacks.length).toBe(0);
  });

  test('alarm names include stage and clusterId', () => {
    const stackComposer = createStackComposer({
      monitoringEnabled: true,
      clusters: [{
        clusterId: "prod",
        clusterType: ClusterType.OPENSEARCH_MANAGED_SERVICE,
      }]
    });

    const monitoringStack = stackComposer.stacks.find(s => s instanceof MonitoringStack) as MonitoringStack;
    const template = Template.fromStack(monitoringStack);
    const alarms = template.findResources("AWS::CloudWatch::Alarm");
    const alarmNames = Object.values(alarms).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.Properties.AlarmName
    );
    expect(alarmNames).toContain("unit-test-prod-cluster-red");
    expect(alarmNames).toContain("unit-test-prod-jvm-memory-pressure");
    expect(alarmNames).toContain("unit-test-prod-snapshot-failure");
  });
});
