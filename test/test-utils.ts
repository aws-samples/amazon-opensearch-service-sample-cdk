import {StackComposer} from "../lib/stack-composer";
import {App} from "aws-cdk-lib";
import {ClusterType} from "../lib/utils/common-utilities";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createStackComposer(context: Record<string, any>) {
    context.stage = context.stage ?? "unit-test"
    console.error(context)
    const app = new App({
        context: context
    })
    return new StackComposer(app, {
        env: {account: "test-account", region: "us-east-1"},
    })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createStackComposerWithSingleDomainContext(clusterContext: Record<string, any>) {
    clusterContext.clusterType = clusterContext.clusterType ?? ClusterType.OPENSEARCH_MANAGED_SERVICE
    clusterContext.clusterId = clusterContext.clusterId ?? "domain"
    const app = new App({
        context: {
            stage: "unit-test",
            clusters: [clusterContext]
        }
    })
    return new StackComposer(app, {
        env: {account: "test-account", region: "us-east-1"},
    })
}
