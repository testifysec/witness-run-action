/**
 * Tests for boolean utility functions.
 */
const booleanUtils = require('../../src/utils/booleanUtils');

describe('Boolean Utilities', () => {
  describe('isValidYamlBoolean', () => {
    test('validates lowercase true/false', () => {
      expect(booleanUtils.isValidYamlBoolean('true')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('false')).toBe(true);
    });
    
    test('validates title case True/False', () => {
      expect(booleanUtils.isValidYamlBoolean('True')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('False')).toBe(true);
    });
    
    test('validates uppercase TRUE/FALSE', () => {
      expect(booleanUtils.isValidYamlBoolean('TRUE')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('FALSE')).toBe(true);
    });
    
    test('validates yes/no variants', () => {
      expect(booleanUtils.isValidYamlBoolean('yes')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('no')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('Yes')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('No')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('YES')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('NO')).toBe(true);
    });
    
    test('validates y/n variants', () => {
      expect(booleanUtils.isValidYamlBoolean('y')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('n')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('Y')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('N')).toBe(true);
    });
    
    test('validates on/off variants', () => {
      expect(booleanUtils.isValidYamlBoolean('on')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('off')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('On')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('Off')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('ON')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('OFF')).toBe(true);
    });
    
    test('rejects non-boolean strings', () => {
      expect(booleanUtils.isValidYamlBoolean('truthy')).toBe(false);
      expect(booleanUtils.isValidYamlBoolean('falsey')).toBe(false);
      expect(booleanUtils.isValidYamlBoolean('enabled')).toBe(false);
      expect(booleanUtils.isValidYamlBoolean('disabled')).toBe(false);
    });
    
    test('trims whitespace from input by default', () => {
      expect(booleanUtils.isValidYamlBoolean('  true  ')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('\ttrue\n')).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('  false  ')).toBe(true);
    });
    
    test('respects trim option', () => {
      expect(booleanUtils.isValidYamlBoolean('  true  ', { trim: true })).toBe(true);
      expect(booleanUtils.isValidYamlBoolean('  true  ', { trim: false })).toBe(false);
    });
    
    test('rejects non-strings', () => {
      expect(booleanUtils.isValidYamlBoolean(true)).toBe(false);
      expect(booleanUtils.isValidYamlBoolean(false)).toBe(false);
      expect(booleanUtils.isValidYamlBoolean(1)).toBe(false);
      expect(booleanUtils.isValidYamlBoolean(0)).toBe(false);
      expect(booleanUtils.isValidYamlBoolean(null)).toBe(false);
      expect(booleanUtils.isValidYamlBoolean(undefined)).toBe(false);
      expect(booleanUtils.isValidYamlBoolean({})).toBe(false);
    });
  });
  
  describe('parseYamlBoolean', () => {
    test('parses true values correctly', () => {
      expect(booleanUtils.parseYamlBoolean('true')).toBe(true);
      expect(booleanUtils.parseYamlBoolean('True')).toBe(true);
      expect(booleanUtils.parseYamlBoolean('TRUE')).toBe(true);
      expect(booleanUtils.parseYamlBoolean('yes')).toBe(true);
      expect(booleanUtils.parseYamlBoolean('y')).toBe(true);
      expect(booleanUtils.parseYamlBoolean('on')).toBe(true);
    });
    
    test('parses false values correctly', () => {
      expect(booleanUtils.parseYamlBoolean('false')).toBe(false);
      expect(booleanUtils.parseYamlBoolean('False')).toBe(false);
      expect(booleanUtils.parseYamlBoolean('FALSE')).toBe(false);
      expect(booleanUtils.parseYamlBoolean('no')).toBe(false);
      expect(booleanUtils.parseYamlBoolean('n')).toBe(false);
      expect(booleanUtils.parseYamlBoolean('off')).toBe(false);
    });
    
    test('returns null for invalid values', () => {
      expect(booleanUtils.parseYamlBoolean('truthy')).toBeNull();
      expect(booleanUtils.parseYamlBoolean('falsey')).toBeNull();
      expect(booleanUtils.parseYamlBoolean('')).toBeNull();
      expect(booleanUtils.parseYamlBoolean(true)).toBeNull();
      expect(booleanUtils.parseYamlBoolean(false)).toBeNull();
      expect(booleanUtils.parseYamlBoolean(1)).toBeNull();
      expect(booleanUtils.parseYamlBoolean(null)).toBeNull();
      expect(booleanUtils.parseYamlBoolean(undefined)).toBeNull();
    });
    
    test('trims whitespace from input by default', () => {
      expect(booleanUtils.parseYamlBoolean('  true  ')).toBe(true);
      expect(booleanUtils.parseYamlBoolean('\tfalse\n')).toBe(false);
    });
    
    test('respects trim option', () => {
      expect(booleanUtils.parseYamlBoolean('  true  ', { trim: true })).toBe(true);
      expect(booleanUtils.parseYamlBoolean('  true  ', { trim: false })).toBeNull();
    });
  });
  
  describe('validateBooleanInput', () => {
    test('preserves the original format of valid booleans', () => {
      expect(booleanUtils.validateBooleanInput('true')).toBe('true');
      expect(booleanUtils.validateBooleanInput('True')).toBe('True');
      expect(booleanUtils.validateBooleanInput('TRUE')).toBe('TRUE');
      expect(booleanUtils.validateBooleanInput('false')).toBe('false');
      expect(booleanUtils.validateBooleanInput('False')).toBe('False');
      expect(booleanUtils.validateBooleanInput('FALSE')).toBe('FALSE');
    });
    
    test('trims whitespace from input by default', () => {
      expect(booleanUtils.validateBooleanInput('  true  ')).toBe('true');
      expect(booleanUtils.validateBooleanInput('\ttrue\n')).toBe('true');
      expect(booleanUtils.validateBooleanInput('  false  ')).toBe('false');
    });
    
    test('respects trim option', () => {
      expect(booleanUtils.validateBooleanInput('  true  ', { trim: true })).toBe('true');
      expect(booleanUtils.validateBooleanInput('  true  ', { trim: false })).toBeNull();
    });
    
    test('converts actual boolean values to lowercase strings', () => {
      expect(booleanUtils.validateBooleanInput(true)).toBe('true');
      expect(booleanUtils.validateBooleanInput(false)).toBe('false');
    });
    
    test('returns null for invalid values when not required', () => {
      expect(booleanUtils.validateBooleanInput('not-a-boolean')).toBeNull();
      expect(booleanUtils.validateBooleanInput('')).toBeNull();
      expect(booleanUtils.validateBooleanInput(null)).toBeNull();
      expect(booleanUtils.validateBooleanInput(undefined)).toBeNull();
    });
    
    test('throws for invalid values when required', () => {
      expect(() => booleanUtils.validateBooleanInput('not-a-boolean', { required: true }))
        .toThrow('Input does not meet YAML 1.2 \'Core Schema\' specification');
      expect(() => booleanUtils.validateBooleanInput('', { required: true }))
        .toThrow('Required boolean input is empty');
      expect(() => booleanUtils.validateBooleanInput(null, { required: true }))
        .toThrow('Required boolean input is empty');
      expect(() => booleanUtils.validateBooleanInput(undefined, { required: true }))
        .toThrow('Required boolean input is empty');
    });
  });
});