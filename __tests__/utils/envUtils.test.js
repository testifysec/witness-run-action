/**
 * Tests for environment variable utilities.
 */
const envUtils = require('../../src/utils/envUtils');

describe('Environment Variable Utilities', () => {
  describe('getEnvKey', () => {
    test('preserves hyphens in input names', () => {
      expect(envUtils.getEnvKey('my-input')).toBe('INPUT_MY-INPUT');
    });
    
    test('converts to uppercase', () => {
      expect(envUtils.getEnvKey('myinput')).toBe('INPUT_MYINPUT');
    });
    
    test('handles mixed case', () => {
      expect(envUtils.getEnvKey('My-Input')).toBe('INPUT_MY-INPUT');
    });
  });
  
  describe('getInputValue', () => {
    test('retrieves values from environment', () => {
      const env = { 'INPUT_MY-INPUT': 'test-value' };
      expect(envUtils.getInputValue(env, 'my-input')).toBe('test-value');
    });
    
    test('returns undefined for missing inputs', () => {
      const env = {};
      expect(envUtils.getInputValue(env, 'missing')).toBeUndefined();
    });
  });
  
  describe('setInputValue', () => {
    test('sets values in environment', () => {
      const env = {};
      envUtils.setInputValue(env, 'my-input', 'test-value');
      expect(env['INPUT_MY-INPUT']).toBe('test-value');
    });
    
    test('overwrites existing values', () => {
      const env = { 'INPUT_MY-INPUT': 'old-value' };
      envUtils.setInputValue(env, 'my-input', 'new-value');
      expect(env['INPUT_MY-INPUT']).toBe('new-value');
    });
  });
  
  describe('hasInputValue', () => {
    test('returns true for existing inputs', () => {
      const env = { 'INPUT_MY-INPUT': 'test-value' };
      expect(envUtils.hasInputValue(env, 'my-input')).toBe(true);
    });
    
    test('returns false for missing inputs', () => {
      const env = {};
      expect(envUtils.hasInputValue(env, 'missing')).toBe(false);
    });
    
    test('returns true for empty string values', () => {
      const env = { 'INPUT_MY-INPUT': '' };
      expect(envUtils.hasInputValue(env, 'my-input')).toBe(true);
    });
  });
  
  // applyDefaultValue function has been removed, so we remove its tests
});