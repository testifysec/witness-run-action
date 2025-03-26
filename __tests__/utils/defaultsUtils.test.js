/**
 * Tests for default value handling utilities.
 */

// Create mock for core
const mockCore = {
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
};

// Mock dependencies
jest.mock('@actions/core', () => mockCore);

// Import after mocking
const { applyDefaultsFromActionYml, checkRequiredInput } = require('../../src/utils/defaultsUtils');

describe('Default Value Handling Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('applyDefaultsFromActionYml', () => {
    test('applies string defaults to environment', () => {
      const env = {};
      const inputs = {
        'string-input': { default: 'default value' }
      };
      
      const applied = applyDefaultsFromActionYml(env, inputs);
      
      expect(env['INPUT_STRING-INPUT']).toBe('default value');
      expect(applied).toContain('string-input');
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('default value'));
    });
    
    test('applies boolean defaults to environment', () => {
      const env = {};
      const inputs = {
        'boolean-input': { default: true }
      };
      
      const applied = applyDefaultsFromActionYml(env, inputs);
      
      expect(env['INPUT_BOOLEAN-INPUT']).toBe('true');
      expect(applied).toContain('boolean-input');
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('true'));
    });
    
    test('applies number defaults to environment', () => {
      const env = {};
      const inputs = {
        'number-input': { default: 42 }
      };
      
      const applied = applyDefaultsFromActionYml(env, inputs);
      
      expect(env['INPUT_NUMBER-INPUT']).toBe('42');
      expect(applied).toContain('number-input');
    });
    
    test('does not override existing values', () => {
      const env = {
        'INPUT_STRING-INPUT': 'existing value'
      };
      const inputs = {
        'string-input': { default: 'default value' }
      };
      
      const applied = applyDefaultsFromActionYml(env, inputs);
      
      expect(env['INPUT_STRING-INPUT']).toBe('existing value');
      expect(applied).not.toContain('string-input');
    });
    
    test('ignores specified inputs', () => {
      const env = {};
      const inputs = {
        'string-input': { default: 'default value' },
        'ignored-input': { default: 'should not be applied' }
      };
      const ignoredInputs = new Set(['ignored-input']);
      
      const applied = applyDefaultsFromActionYml(env, inputs, ignoredInputs);
      
      expect(env['INPUT_STRING-INPUT']).toBe('default value');
      expect(env['INPUT_IGNORED-INPUT']).toBeUndefined();
      expect(applied).toContain('string-input');
      expect(applied).not.toContain('ignored-input');
    });
    
    test('warns about missing required inputs', () => {
      const env = {};
      const inputs = {
        'required-input': { required: true }
      };
      
      applyDefaultsFromActionYml(env, inputs);
      
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('required-input'));
    });
    
    test('handles empty inputs object', () => {
      const env = {};
      const inputs = null;
      
      const applied = applyDefaultsFromActionYml(env, inputs);
      
      expect(applied).toEqual([]);
    });
  });
  
  describe('checkRequiredInput', () => {
    test('returns true when input is present', () => {
      const env = {
        'INPUT_REQUIRED-INPUT': 'value'
      };
      
      const result = checkRequiredInput(env, 'required-input');
      
      expect(result).toBe(true);
      expect(mockCore.warning).not.toHaveBeenCalled();
    });
    
    test('warns and returns false when input is missing', () => {
      const env = {};
      
      const result = checkRequiredInput(env, 'required-input');
      
      expect(result).toBe(false);
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('required-input'));
    });
    
    test('throws error when input is missing and errorOnMissing is true', () => {
      const env = {};
      
      expect(() => {
        checkRequiredInput(env, 'required-input', { errorOnMissing: true });
      }).toThrow('Required input');
    });
  });
  
  // getTypedDefault function has been removed, so we remove its tests
});