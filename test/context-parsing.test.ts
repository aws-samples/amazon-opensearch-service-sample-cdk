import { getContextForType } from "../lib/components/context-parsing";
import { describe, test, expect } from '@jest/globals';

describe('context-parsing', () => {

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
});
