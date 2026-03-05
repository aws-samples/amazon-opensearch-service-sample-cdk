import { describe, test, expect } from 'vitest';
import { createApp } from '../bin/createApp';

describe('createApp', () => {
  test('is a function', () => {
    expect(typeof createApp).toBe('function');
  });
});
