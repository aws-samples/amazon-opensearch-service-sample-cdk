import { getContextForType, parseClusterConfig } from "../lib/components/context-parsing";
import { describe, test, expect, vi, afterEach } from 'vitest';
import { CdkLogger } from "../lib/components/cdk-logger";

describe('context-parsing', () => {

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getContextForType', () => {
    const emptyDefaults = {};

    test('returns string value directly', () => {
      expect(getContextForType('key', 'string', emptyDefaults, { key: 'hello' })).toBe('hello');
    });

    test('returns number value directly', () => {
      expect(getContextForType('key', 'number', emptyDefaults, { key: 42 })).toBe(42);
    });

    test('returns boolean value directly', () => {
      expect(getContextForType('key', 'boolean', emptyDefaults, { key: true })).toBe(true);
    });

    test('returns false without treating it as missing', () => {
      expect(getContextForType('key', 'boolean', emptyDefaults, { key: false })).toBe(false);
    });

    test('returns 0 without treating it as missing', () => {
      expect(getContextForType('key', 'number', emptyDefaults, { key: 0 })).toBe(0);
    });

    test('falls back to default when value is undefined', () => {
      expect(getContextForType('key', 'string', { key: 'default' }, {})).toBe('default');
    });

    test('falls back to default when value is empty string', () => {
      expect(getContextForType('key', 'string', { key: 'default' }, { key: '' })).toBe('default');
    });

    test('returns undefined when no value and no default', () => {
      expect(getContextForType('key', 'string', emptyDefaults, {})).toBeUndefined();
    });

    // CLI string coercion tests
    test('coerces CLI string to number', () => {
      expect(getContextForType('key', 'number', emptyDefaults, { key: '42' })).toBe(42);
    });

    test('coerces CLI string "true" to boolean', () => {
      expect(getContextForType('key', 'boolean', emptyDefaults, { key: 'true' })).toBe(true);
    });

    test('coerces CLI string "false" to boolean', () => {
      expect(getContextForType('key', 'boolean', emptyDefaults, { key: 'false' })).toBe(false);
    });

    test('coerces CLI JSON string to object', () => {
      const result = getContextForType('key', 'object', emptyDefaults, { key: '["a","b"]' });
      expect(result).toEqual(['a', 'b']);
    });

    test('throws on invalid JSON for object type', () => {
      expect(() => getContextForType('key', 'object', emptyDefaults, { key: 'not-json' })).toThrow();
    });

    test('throws on type mismatch from context file', () => {
      expect(() => getContextForType('key', 'string', emptyDefaults, { key: 123 })).toThrow(
        /Type provided by cdk.context.json for key was number but expected string/
      );
    });
  });

  describe('parseClusterConfig cross-field validation', () => {
    const defaults = {};

    test('warns when serverless cluster has managed-only fields', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const warnSpy = vi.spyOn(CdkLogger, 'warn').mockImplementation(() => {});
      parseClusterConfig({
        clusterId: 'test',
        clusterType: 'OPENSEARCH_SERVERLESS',
        dataNodeType: 'r6g.large.search',
        ebsEnabled: true,
      }, defaults, 'test-stage');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring managed-only fields on serverless cluster')
      );
    });

    test('warns when managed cluster has serverless-only fields', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const warnSpy = vi.spyOn(CdkLogger, 'warn').mockImplementation(() => {});
      parseClusterConfig({
        clusterId: 'test',
        clusterType: 'OPENSEARCH_MANAGED_SERVICE',
        collectionType: 'SEARCH',
      }, defaults, 'test-stage');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring serverless-only fields on managed cluster')
      );
    });

    test('does not warn when fields match cluster type', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const warnSpy = vi.spyOn(CdkLogger, 'warn').mockImplementation(() => {});
      parseClusterConfig({
        clusterId: 'test',
        clusterType: 'OPENSEARCH_SERVERLESS',
        collectionType: 'SEARCH',
        standbyReplicas: 'DISABLED',
      }, defaults, 'test-stage');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('throws when clusterId is missing', () => {
      expect(() => parseClusterConfig({ clusterType: 'OPENSEARCH_SERVERLESS' }, defaults, 'test')).toThrow(
        /clusterId.*required/
      );
    });

    test('throws when clusterType is missing', () => {
      expect(() => parseClusterConfig({ clusterId: 'test' }, defaults, 'test')).toThrow(
        /clusterType.*required/
      );
    });
  });
});
