import {Construct} from "constructs";
import {readFileSync} from "fs";
import {CdkLogger} from "./cdk-logger";
import {ClusterConfig, ManagedClusterConfig, ServerlessClusterConfig} from "./cluster-config";
import {TLSSecurityPolicy} from "aws-cdk-lib/aws-opensearchservice";
import {MAX_CLUSTER_ID_LENGTH, parseRemovalPolicy} from "./common-utilities";

/**
 * Coerce a CLI-provided string value to the expected type.
 *
 * CDK CLI passes all `--context` values as strings. When the caller expects
 * a number, boolean, or object we need to parse the string into the right JS type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coerceCliString(value: string, expectedType: string, optionName: string): any {
    if (expectedType === 'number') {
        return parseInt(value)
    }
    if (expectedType === 'boolean' || expectedType === 'object') {
        try {
            return JSON.parse(value)
        } catch (e) {
            if (e instanceof SyntaxError) {
                CdkLogger.error(`Unable to parse option: ${optionName} with expected type: ${expectedType}`)
            }
            throw e
        }
    }
    return value
}

/**
 * Retrieve a typed context value, falling back to defaults.
 *
 * Resolution order:
 * 1. Value from contextJSON (parsed from file or CDK context)
 * 2. Value from defaultValues
 * 3. undefined
 *
 * CLI-provided strings are automatically coerced to the expected type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getContextForType(optionName: string, expectedType: string, defaultValues: Record<string, any>, contextJSON: Record<string, any>): any {
    const option = contextJSON[optionName]

    // Fall back to default when context value is missing or empty string
    if ((option === undefined || option === "") && defaultValues[optionName]) {
        return defaultValues[optionName]
    }

    // Treat null, undefined, empty string, and NaN as absent (but preserve false and 0)
    if (option !== false && option !== 0 && !option) {
        return undefined
    }

    // CLI values arrive as strings — coerce to the expected type
    if (typeof option === 'string') {
        return coerceCliString(option, expectedType, optionName)
    }

    // Context file / cdk.context.json values should already be the right type
    if (typeof option !== expectedType) {
        throw new Error(`Type provided by cdk.context.json for ${optionName} was ${typeof option} but expected ${expectedType}`)
    }
    return option
}

/**
 * Parse the CDK context into a plain JSON object.
 *
 * Supports two input modes:
 * 1. **Context file** (`--context contextFile=path.json`) — reads and parses the file directly.
 * 2. **Inline CDK context** — filters out internal AWS/CDK keys, then handles the
 *    double-escaped string case that occurs when the entire context block is passed
 *    as a single CLI string (e.g. `--context '{"stage":"dev"}'`).
 *
 *    The double-parse on line ~85 is intentional: the CDK CLI wraps the value in an
 *    extra layer of JSON escaping, so the first `JSON.parse` unwraps the escaping and
 *    the second produces the actual object.
 */
export function parseContextJson(scope: Construct) {
    const contextFile = scope.node.tryGetContext("contextFile")
    if (contextFile) {
        const fileString = readFileSync(contextFile, 'utf-8');
        try {
            return JSON.parse(fileString)
        } catch (error) {
            throw new Error(`Unable to parse context file ${contextFile} into JSON`, { cause: error });
        }
    }

    const fullContext = scope.node.getAllContext();
    let contextJSON = Object.fromEntries(
        Object.entries(fullContext).filter(([key]) => {
            return !key.startsWith('@aws-sdk') && !key.startsWith('@aws-cdk') && !key.startsWith('aws:cdk');
        })
    );

    // CDK CLI double-escapes context passed as a single string argument.
    // First parse: unwrap the outer escaping → yields a JSON string.
    // Second parse: convert that JSON string → yields the actual object.
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

    // Cross-field validation: serverless clusters should not have managed-only fields
    const managedOnlyFields = [
        'dataNodeType', 'dataNodeCount', 'dedicatedManagerNodeType', 'dedicatedManagerNodeCount',
        'warmNodeType', 'warmNodeCount', 'ebsEnabled', 'ebsIops', 'ebsThroughput', 'ebsVolumeSize',
        'ebsVolumeType', 'clusterVersion', 'useUnsignedBasicAuth', 'fineGrainedManagerUserARN',
        'fineGrainedManagerUserSecretARN', 'enableDemoAdmin', 'enforceHTTPS', 'tlsSecurityPolicy',
        'encryptionAtRestEnabled', 'encryptionAtRestKmsKeyARN', 'loggingAppLogEnabled',
        'loggingAppLogGroupARN', 'slowSearchLogEnabled', 'slowSearchLogGroupARN',
        'auditLogEnabled', 'auditLogGroupARN',
        'nodeToNodeEncryptionEnabled', 'openAccessPolicyEnabled',
        'accessPolicies', 'clusterSubnetIds', 'clusterSecurityGroupIds',
        'coldStorageEnabled', 'multiAZWithStandbyEnabled', 'offPeakWindowEnabled',
        'samlEntityId', 'samlMetadataContent', 'samlMasterUserName', 'samlMasterBackendRole',
        'samlRolesKey', 'samlSubjectKey', 'samlSessionTimeoutMinutes',
        'cognitoUserPoolId', 'cognitoIdentityPoolId', 'cognitoRoleArn',
        'customEndpoint', 'customEndpointCertificateArn',
        'autoTuneEnabled', 'allowAllVpcTraffic',
    ];
    const serverlessOnlyFields = ['collectionType', 'standbyReplicas', 'sourceIPAddresses'];

    if (clusterType === 'OPENSEARCH_SERVERLESS') {
        const invalidFields = managedOnlyFields.filter(f => config[f] !== undefined);
        if (invalidFields.length > 0) {
            CdkLogger.warn(`Cluster '${clusterId}': Ignoring managed-only fields on serverless cluster: ${invalidFields.join(', ')}`);
        }
    }
    if (clusterType === 'OPENSEARCH_MANAGED_SERVICE') {
        const invalidFields = serverlessOnlyFields.filter(f => config[f] !== undefined);
        if (invalidFields.length > 0) {
            CdkLogger.warn(`Cluster '${clusterId}': Ignoring serverless-only fields on managed cluster: ${invalidFields.join(', ')}`);
        }
    }

    const clusterName = config.clusterName ?? `cluster-${stage}-${config.clusterId}`;

    const domainRemovalPolicyName = getContextForType('domainRemovalPolicy', 'string', defaults, config)
    const domainRemovalPolicy = parseRemovalPolicy("domainRemovalPolicy", domainRemovalPolicyName)

    // Return the correct discriminated union variant based on clusterType
    if (clusterType === 'OPENSEARCH_SERVERLESS') {
        const rawCollections = getContextForType('collections', 'object', defaults, config);
        const collections = Array.isArray(rawCollections) ? rawCollections.map((c: Record<string, unknown>) => ({
            collectionName: c.collectionName as string,
            collectionType: c.collectionType as string | undefined,
        })) : undefined;

        return {
            clusterId,
            clusterType: 'OPENSEARCH_SERVERLESS',
            clusterName,
            domainRemovalPolicy,
            collectionType: getContextForType('collectionType', 'string', defaults, config),
            standbyReplicas: getContextForType('standbyReplicas', 'string', defaults, config),
            vpcEndpointId: getContextForType('vpcEndpointId', 'string', defaults, config),
            createVpcEndpoint: getContextForType('createVpcEndpoint', 'boolean', defaults, config),
            collections,
            dataAccessPrincipals: getContextForType('dataAccessPrincipals', 'object', defaults, config),
            sourceIPAddresses: getContextForType('sourceIPAddresses', 'object', defaults, config),
        } satisfies ServerlessClusterConfig;
    }

    const tlsSecurityPolicyName = getContextForType('tlsSecurityPolicy', 'string', defaults, config)
    const tlsSecurityPolicy: TLSSecurityPolicy|undefined = tlsSecurityPolicyName ? TLSSecurityPolicy[tlsSecurityPolicyName as keyof typeof TLSSecurityPolicy] : undefined
    if (tlsSecurityPolicyName && !tlsSecurityPolicy) {
        throw new Error("Provided tlsSecurityPolicy does not match a selectable option, for reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_opensearchservice.TLSSecurityPolicy.html")
    }

    return {
        clusterId,
        clusterType: 'OPENSEARCH_MANAGED_SERVICE',
        clusterName,
        clusterVersion: getContextForType('clusterVersion', 'string', defaults, config),
        clusterSubnetIds: getContextForType('clusterSubnetIds', 'object', defaults, config),
        clusterSecurityGroupIds: getContextForType('clusterSecurityGroupIds', 'object', defaults, config),
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
        ebsThroughput: getContextForType('ebsThroughput', 'number', defaults, config),
        ebsVolumeSize: getContextForType('ebsVolumeSize', 'number', defaults, config),
        ebsVolumeType: getContextForType('ebsVolumeType', 'string', defaults, config),
        encryptionAtRestEnabled: getContextForType('encryptionAtRestEnabled', 'boolean', defaults, config),
        encryptionAtRestKmsKeyARN: getContextForType('encryptionAtRestKmsKeyARN', 'string', defaults, config),
        loggingAppLogEnabled: getContextForType('loggingAppLogEnabled', 'boolean', defaults, config),
        loggingAppLogGroupARN: getContextForType('loggingAppLogGroupARN', 'string', defaults, config),
        nodeToNodeEncryptionEnabled: getContextForType('nodeToNodeEncryptionEnabled', 'boolean', defaults, config),
        openAccessPolicyEnabled: getContextForType('openAccessPolicyEnabled', 'boolean', defaults, config),
        accessPolicies: getContextForType('accessPolicies', 'object', defaults, config),
        coldStorageEnabled: getContextForType('coldStorageEnabled', 'boolean', defaults, config),
        multiAZWithStandbyEnabled: getContextForType('multiAZWithStandbyEnabled', 'boolean', defaults, config),
        offPeakWindowEnabled: getContextForType('offPeakWindowEnabled', 'boolean', defaults, config),
        samlEntityId: getContextForType('samlEntityId', 'string', defaults, config),
        samlMetadataContent: getContextForType('samlMetadataContent', 'string', defaults, config),
        samlMasterUserName: getContextForType('samlMasterUserName', 'string', defaults, config),
        samlMasterBackendRole: getContextForType('samlMasterBackendRole', 'string', defaults, config),
        samlRolesKey: getContextForType('samlRolesKey', 'string', defaults, config),
        samlSubjectKey: getContextForType('samlSubjectKey', 'string', defaults, config),
        samlSessionTimeoutMinutes: getContextForType('samlSessionTimeoutMinutes', 'number', defaults, config),
        cognitoUserPoolId: getContextForType('cognitoUserPoolId', 'string', defaults, config),
        cognitoIdentityPoolId: getContextForType('cognitoIdentityPoolId', 'string', defaults, config),
        cognitoRoleArn: getContextForType('cognitoRoleArn', 'string', defaults, config),
        customEndpoint: getContextForType('customEndpoint', 'string', defaults, config),
        customEndpointCertificateArn: getContextForType('customEndpointCertificateArn', 'string', defaults, config),
        autoTuneEnabled: getContextForType('autoTuneEnabled', 'boolean', defaults, config),
        allowAllVpcTraffic: getContextForType('allowAllVpcTraffic', 'boolean', defaults, config),
        slowSearchLogEnabled: getContextForType('slowSearchLogEnabled', 'boolean', defaults, config),
        slowSearchLogGroupARN: getContextForType('slowSearchLogGroupARN', 'string', defaults, config),
        auditLogEnabled: getContextForType('auditLogEnabled', 'boolean', defaults, config),
        auditLogGroupARN: getContextForType('auditLogGroupARN', 'string', defaults, config),
        domainRemovalPolicy,
    } satisfies ManagedClusterConfig;
}
