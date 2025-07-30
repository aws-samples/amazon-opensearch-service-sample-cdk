import {Construct} from "constructs";
import {readFileSync} from "fs";
import {CdkLogger} from "./cdk-logger";

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

    let contextJSON = scope.node.getAllContext()
    // For a context block to be provided as a string (as in the case of providing via command line) it will need to be properly escaped
    // to be captured. This requires JSON to parse twice, 1. Returns a normal JSON string with no escaping 2. Returns a JSON object for use
    if (typeof contextJSON === 'string') {
        contextJSON = JSON.parse(JSON.parse(contextJSON))
    }
    return contextJSON
}