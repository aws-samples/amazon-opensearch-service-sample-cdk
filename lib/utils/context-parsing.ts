import {Construct} from "constructs";
import {readFileSync} from "fs";
import {CdkLogger} from "./cdk-logger";
import {ClusterConfig} from "./cluster-config";
import {TLSSecurityPolicy} from "aws-cdk-lib/aws-opensearchservice";
import {MAX_CLUSTER_ID_LENGTH, parseRemovalPolicy} from "./common-utilities";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getContextForType(optionName: string, expectedType: string, defaultValues: Record<string, any>, contextJSON: Record<string, any>): any {
    const option = contextJSON[optionName]

    // If no context is provided (undefined or empty string) and a default value exists, use it
    if ((option === undefined || option === "") && defaultValues[optionName]) {
        return defaultValues[optionName]
    }

    // Filter out invalid or missing options by setting undefined (empty strings, null, undefined, NaN)
    if (option !== false && option !== 0 && !option) {
        return undefined
    }
    // Values provided by the CLI will always be represented as a string and need to be parsed
    if (typeof option === 'string') {
        if (expectedType === 'number') {
            return parseInt(option)
        }
        if (expectedType === 'boolean' || expectedType === 'object') {
            try {
                return JSON.parse(option)
            } catch (e) {
                if (e instanceof SyntaxError) {
                    CdkLogger.error(`Unable to parse option: ${optionName} with expected type: ${expectedType}`)
                }
                throw e
            }
        }
    }
    // Values provided by the cdk.context.json should be of the desired type
    if (typeof option !== expectedType) {
        throw new Error(`Type provided by cdk.context.json for ${optionName} was ${typeof option} but expected ${expectedType}`)
    }
    return option
}

export function parseContextJson(scope: Construct) {
    const contextFile = scope.node.tryGetContext("contextFile")
    if (contextFile) {
        const fileString = readFileSync(contextFile, 'utf-8');
        let fileJSON
        try {
            fileJSON = JSON.parse(fileString)
        } catch (error) {
            throw new Error(`Unable to parse context file ${contextFile} into JSON with following error: ${error}`);
        }
        return fileJSON
    }

    const fullContext = scope.node.getAllContext();
    // Filter out internal AWS/CDK keys
    let contextJSON = Object.fromEntries(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        Object.entries(fullContext).filter(([key, _]) => {
            return !key.startsWith('@aws-sdk') && !key.startsWith('@aws-cdk') && !key.startsWith('aws:cdk');
        })
    );
    // For a context block to be provided as a string (as in the case of providing via command line) it will need to be properly escaped
    // to be captured. This requires JSON to parse twice, 1. Returns a normal JSON string with no escaping 2. Returns a JSON object for use
    if (typeof contextJSON === 'string') {
        contextJSON = JSON.parse(JSON.parse(contextJSON))
    }
    return contextJSON
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseClusterConfig(config: Record<string, any>, defaults: Record<string, any>, stage: string): ClusterConfig {
    const clusterId = getContextForType('clusterId', 'string', defaults, config);
    const clusterType = getContextForType('clusterType', 'string', defaults, config);
    if (!clusterId) {
        throw new Error(`The 'clusterId' setting is required for each cluster.`);
    }
    if (clusterId.length > MAX_CLUSTER_ID_LENGTH ) {
        throw new Error(`Maximum allowed cluster id length is ${MAX_CLUSTER_ID_LENGTH} characters but received ${clusterId}`)
    }
    if (!clusterType) {
        throw new Error(`The 'clusterType' setting is required for each cluster.`);
    }

    const clusterName = config.clusterName ?? `cluster-${stage}-${config.clusterId}`;

    const domainRemovalPolicyName = getContextForType('domainRemovalPolicy', 'string', defaults, config)
    const domainRemovalPolicy = parseRemovalPolicy("domainRemovalPolicy", domainRemovalPolicyName)

    const tlsSecurityPolicyName = getContextForType('tlsSecurityPolicy', 'string', defaults, config)
    const tlsSecurityPolicy: TLSSecurityPolicy|undefined = tlsSecurityPolicyName ? TLSSecurityPolicy[tlsSecurityPolicyName as keyof typeof TLSSecurityPolicy] : undefined
    if (tlsSecurityPolicyName && !tlsSecurityPolicy) {
        throw new Error("Provided tlsSecurityPolicy does not match a selectable option, for reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_opensearchservice.TLSSecurityPolicy.html")
    }

    return {
        clusterId,
        clusterType,
        clusterName,
        clusterVersion: getContextForType('clusterVersion', 'string', defaults, config),
        clusterSubnetIds: getContextForType('clusterSubnetIds', 'object', defaults, config),
        clusterSecurityGroupIds: getContextForType('clusterSecurityGroupIds', 'object', defaults, config),

        // OpenSearch-specific
        dataNodeType: getContextForType('dataNodeType', 'string', defaults, config),
        dataNodeCount: getContextForType('dataNodeCount', 'number', defaults, config),
        dedicatedManagerNodeType: getContextForType('dedicatedManagerNodeType', 'string', defaults, config),
        dedicatedManagerNodeCount: getContextForType('dedicatedManagerNodeCount', 'number', defaults, config),
        warmNodeType: getContextForType('warmNodeType', 'string', defaults, config),
        warmNodeCount: getContextForType('warmNodeCount', 'number', defaults, config),
        useUnsignedBasicAuth: getContextForType('useUnsignedBasicAuth', 'boolean', defaults, config),
        fineGrainedManagerUserARN: getContextForType('fineGrainedManagerUserARN', 'string', defaults, config),
        fineGrainedManagerUserSecretARN: getContextForType('fineGrainedManagerUserSecretARN', 'string', defaults, config),
        enableDemoAdmin: getContextForType('enableDemoAdmin', 'boolean', defaults, config),
        enforceHTTPS: getContextForType('enforceHTTPS', 'boolean', defaults, config),
        tlsSecurityPolicy,
        ebsEnabled: getContextForType('ebsEnabled', 'boolean', defaults, config),
        ebsIops: getContextForType('ebsIops', 'number', defaults, config),
        ebsVolumeSize: getContextForType('ebsVolumeSize', 'number', defaults, config),
        ebsVolumeType: getContextForType('ebsVolumeType', 'string', defaults, config),
        encryptionAtRestEnabled: getContextForType('encryptionAtRestEnabled', 'boolean', defaults, config),
        encryptionAtRestKmsKeyARN: getContextForType('encryptionAtRestKmsKeyARN', 'string', defaults, config),
        loggingAppLogEnabled: getContextForType('loggingAppLogEnabled', 'boolean', defaults, config),
        loggingAppLogGroupARN: getContextForType('loggingAppLogGroupARN', 'string', defaults, config),
        nodeToNodeEncryptionEnabled: getContextForType('nodeToNodeEncryptionEnabled', 'boolean', defaults, config),
        openAccessPolicyEnabled: getContextForType('openAccessPolicyEnabled', 'boolean', defaults, config),
        accessPolicies: getContextForType('accessPolicies', 'object', defaults, config),
        domainRemovalPolicy,
    };
}
