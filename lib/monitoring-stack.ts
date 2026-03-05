import { Construct } from "constructs";
import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { Topic } from "aws-cdk-lib/aws-sns";

export interface MonitoringStackProps extends StackProps {
    readonly stage: string;
    readonly domainName: string;
    readonly clusterId: string;
    /** Optional SNS topic ARN for alarm notifications */
    readonly snsTopicArn?: string;
}

export class MonitoringStack extends Stack {

    constructor(scope: Construct, id: string, props: MonitoringStackProps) {
        super(scope, id, props);

        const { domainName, clusterId, stage } = props;
        const ns = 'AWS/ES';
        const dimensions = { DomainName: domainName, ClientId: this.account };

        const metric = (name: string, statistic = 'Maximum') =>
            new Metric({ namespace: ns, metricName: name, dimensionsMap: dimensions, statistic, period: Duration.minutes(5) });

        // Cluster health — red
        new Alarm(this, 'ClusterRedAlarm', {
            alarmName: `${stage}-${clusterId}-cluster-red`,
            alarmDescription: 'OpenSearch cluster status is RED — at least one primary shard is unassigned',
            metric: metric('ClusterStatus.red'),
            threshold: 1,
            evaluationPeriods: 1,
            comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: TreatMissingData.NOT_BREACHING,
        });

        // Cluster health — yellow
        new Alarm(this, 'ClusterYellowAlarm', {
            alarmName: `${stage}-${clusterId}-cluster-yellow`,
            alarmDescription: 'OpenSearch cluster status is YELLOW — at least one replica shard is unassigned',
            metric: metric('ClusterStatus.yellow'),
            threshold: 1,
            evaluationPeriods: 3,
            comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: TreatMissingData.NOT_BREACHING,
        });

        // Free storage space < 25% (20 GiB threshold as proxy)
        new Alarm(this, 'FreeStorageAlarm', {
            alarmName: `${stage}-${clusterId}-free-storage-low`,
            alarmDescription: 'OpenSearch free storage space is critically low',
            metric: metric('FreeStorageSpace', 'Minimum'),
            threshold: 20480, // 20 GiB in MiB
            evaluationPeriods: 1,
            comparisonOperator: ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: TreatMissingData.BREACHING,
        });

        // JVM memory pressure > 80%
        new Alarm(this, 'JVMMemoryPressureAlarm', {
            alarmName: `${stage}-${clusterId}-jvm-memory-pressure`,
            alarmDescription: 'OpenSearch JVM memory pressure exceeds 80%',
            metric: metric('JVMMemoryPressure'),
            threshold: 80,
            evaluationPeriods: 3,
            comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: TreatMissingData.NOT_BREACHING,
        });

        // CPU utilization > 80%
        new Alarm(this, 'CPUUtilizationAlarm', {
            alarmName: `${stage}-${clusterId}-cpu-high`,
            alarmDescription: 'OpenSearch CPU utilization exceeds 80%',
            metric: metric('CPUUtilization'),
            threshold: 80,
            evaluationPeriods: 3,
            comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: TreatMissingData.NOT_BREACHING,
        });

        // Search latency p99 > 1 second
        new Alarm(this, 'SearchLatencyAlarm', {
            alarmName: `${stage}-${clusterId}-search-latency-high`,
            alarmDescription: 'OpenSearch search latency p99 exceeds 1 second',
            metric: metric('SearchLatency', 'p99'),
            threshold: 1000, // milliseconds
            evaluationPeriods: 3,
            comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: TreatMissingData.NOT_BREACHING,
        });

        // Automated snapshot failure
        new Alarm(this, 'SnapshotFailureAlarm', {
            alarmName: `${stage}-${clusterId}-snapshot-failure`,
            alarmDescription: 'OpenSearch automated snapshot failed',
            metric: metric('AutomatedSnapshotFailure'),
            threshold: 1,
            evaluationPeriods: 1,
            comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: TreatMissingData.NOT_BREACHING,
        });

        // Optional SNS topic for alarm actions
        if (props.snsTopicArn) {
            const topic = Topic.fromTopicArn(this, 'AlarmTopic', props.snsTopicArn);
            for (const child of this.node.children) {
                if (child instanceof Alarm) {
                    child.addAlarmAction({ bind: () => ({ alarmActionArn: topic.topicArn }) });
                }
            }
        }
    }
}
