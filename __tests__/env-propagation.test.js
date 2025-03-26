/**
 * Tests for environment variable propagation - ensuring inputs are correctly
 * normalized, propagated, and accessed in a manner matching GitHub's behavior.
 */

// Mock core module
const mockCore = {
  getInput: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
};

// Mock dependencies
jest.mock('@actions/core', () => mockCore);

// Import the utility functions
const { getEnvKey, getInputValue, setInputValue, hasInputValue } = require('../src/utils/envUtils');
const { applyDefaultsFromActionYml } = require('../src/utils/defaultsUtils');
const WitnessActionRunner = require('../src/runners/WitnessActionRunner');

describe('Environment Variable Propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('envUtils functions', () => {
    test('getEnvKey preserves hyphens and converts spaces to underscores', () => {
      expect(getEnvKey('my-input')).toBe('INPUT_MY-INPUT');
      expect(getEnvKey('my_input')).toBe('INPUT_MY_INPUT');
      expect(getEnvKey('myInput')).toBe('INPUT_MYINPUT');
      expect(getEnvKey('my input')).toBe('INPUT_MY_INPUT');
      expect(getEnvKey('my-input with spaces')).toBe('INPUT_MY-INPUT_WITH_SPACES');
    });
    
    test('getInputValue retrieves and trims value using correct environment variable key', () => {
      const env = {
        'INPUT_MY-INPUT': '  test value  ',
        'INPUT_ANOTHER_INPUT': 'another value',
        'INPUT_MY_INPUT_WITH_SPACES': 'value with spaces'
      };
      
      expect(getInputValue(env, 'my-input')).toBe('test value');
      expect(getInputValue(env, 'my-input', { trim: false })).toBe('  test value  ');
      expect(getInputValue(env, 'another_input')).toBe('another value');
      expect(getInputValue(env, 'my input with spaces')).toBe('value with spaces');
    });
    
    test('setInputValue sets and trims value using correct environment variable key', () => {
      const env = {};
      
      setInputValue(env, 'my-input', '  new value  ');
      expect(env['INPUT_MY-INPUT']).toBe('new value');
      
      setInputValue(env, 'another_input', 'another value');
      expect(env['INPUT_ANOTHER_INPUT']).toBe('another value');
      
      setInputValue(env, 'with spaces', 'value with spaces');
      expect(env['INPUT_WITH_SPACES']).toBe('value with spaces');
      
      setInputValue(env, 'no-trim', '  keep spaces  ', { trim: false });
      expect(env['INPUT_NO-TRIM']).toBe('  keep spaces  ');
    });
    
    test('hasInputValue checks correct environment variable key', () => {
      const env = {
        'INPUT_MY-INPUT': 'test value',
      };
      
      expect(hasInputValue(env, 'my-input')).toBe(true);
      expect(hasInputValue(env, 'missing-input')).toBe(false);
    });
  });
  
  describe('defaultsUtils functions', () => {
    test('applyDefaultsFromActionYml applies defaults with correct environment variable keys', () => {
      const env = {};
      const inputs = {
        'my-input': { default: 'default value' },
        'another-input': { default: true }
      };
      
      const applied = applyDefaultsFromActionYml(env, inputs);
      
      expect(env['INPUT_MY-INPUT']).toBe('default value');
      expect(env['INPUT_ANOTHER-INPUT']).toBe('true');
      expect(applied).toContain('my-input');
      expect(applied).toContain('another-input');
    });
  });
  
  describe('WitnessActionRunner', () => {
    test('getWrappedActionEnv handles input environment variables correctly', () => {
      // Create a mock action.yml content
      const fs = require('fs');
      const yaml = require('js-yaml');
      const { getActionYamlPath } = require('../src/actions/actionUtils');
      
      // Mock dependencies needed by getWrappedActionEnv
      jest.mock('fs', () => ({
        readFileSync: jest.fn().mockReturnValue('name: Test Action\ninputs:\n  my-input:\n    default: default value\n  required-input:\n    required: true'),
        existsSync: jest.fn().mockReturnValue(true)
      }));
      
      jest.mock('js-yaml', () => ({
        load: jest.fn().mockReturnValue({
          name: 'Test Action',
          inputs: {
            'my-input': { default: 'default value' },
            'required-input': { required: true }
          }
        })
      }));
      
      jest.mock('../src/actions/actionUtils', () => ({
        getActionYamlPath: jest.fn().mockReturnValue('/test/action.yml')
      }));
      
      // Setup environment for test
      const originalEnv = process.env;
      process.env = {
        ...process.env,
        'INPUT_PROVIDED-INPUT': 'provided value',
        'INPUT_INPUT-PREFIXED': 'prefixed value'
      };
      
      const runner = new WitnessActionRunner();
      const actionEnv = runner.getWrappedActionEnv('/test/action');
      
      // Check that provided inputs are preserved
      expect(actionEnv['INPUT_PROVIDED-INPUT']).toBe('provided value');
      
      // Check that input-prefixed parameters are correctly handled
      expect(actionEnv['INPUT_PREFIXED']).toBe('prefixed value');
      expect(actionEnv['INPUT_INPUT-PREFIXED']).toBeUndefined();
      
      // Check that defaults were applied
      expect(actionEnv['INPUT_MY-INPUT']).toBe('default value');
      
      // Restore environment
      process.env = originalEnv;
    });
  });
});