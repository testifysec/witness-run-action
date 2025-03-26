/**
 * Tests for default input handling in WitnessActionRunner
 */
const fs = require('fs');
const yaml = require('js-yaml');
const core = require('@actions/core');

// Mock action.yml content
const MOCK_ACTION_YAML = `
name: Mock Action
description: A mock action for testing default inputs
inputs:
  string-input:
    description: "String input"
    default: "default string value"
  boolean-input:
    description: "Boolean input"
    default: false
  required-input:
    description: "Required input"
    required: true  
  number-input:
    description: "Number input"
    default: 42
  install-only:
    description: "Install only flag for GoReleaser"
    default: false
runs:
  using: node16
  main: index.js
`;

// Create proper mocks
const mockCore = {
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
  setFailed: jest.fn()
};

// Mock modules
jest.mock('@actions/core', () => mockCore);
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(MOCK_ACTION_YAML)
}));
jest.mock('../src/actions/actionUtils', () => ({
  getActionYamlPath: jest.fn().mockReturnValue('/mock/action/dir/action.yml')
}));

// Import after mocking
const WitnessActionRunner = require('../src/runners/WitnessActionRunner');

describe('Input handling tests', () => {
  let runner;
  let originalEnv;
  
  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;
    process.env = {};
    runner = new WitnessActionRunner();
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  test('1. Default values should be applied from action.yml', () => {
    // Empty environment - should use defaults
    const env = runner.getWrappedActionEnv('/mock/action/dir');
    
    // Verify defaults were applied and converted to strings
    // GitHub Actions preserves hyphens in environment variable names
    expect(env['INPUT_STRING-INPUT']).toBe('default string value');
    expect(env['INPUT_BOOLEAN-INPUT']).toBe('false');
    expect(env['INPUT_NUMBER-INPUT']).toBe('42');
    
    // Required input should warn but not have a default
    expect(env['INPUT_REQUIRED-INPUT']).toBeUndefined();
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('Required input')
    );
  });
  
  test('2. User-provided inputs should override defaults', () => {
    // Set environment with some values
    // GitHub Actions preserves hyphens in environment variable names
    process.env['INPUT_STRING-INPUT'] = 'user value';
    process.env['INPUT_BOOLEAN-INPUT'] = 'true';
    process.env['INPUT_REQUIRED-INPUT'] = 'provided';
    
    const env = runner.getWrappedActionEnv('/mock/action/dir');
    
    // Provided values should be used
    expect(env['INPUT_STRING-INPUT']).toBe('user value');
    expect(env['INPUT_BOOLEAN-INPUT']).toBe('true');
    expect(env['INPUT_REQUIRED-INPUT']).toBe('provided');
    
    // Other defaults should still be applied
    expect(env['INPUT_NUMBER-INPUT']).toBe('42');
  });
  
  test('3. Boolean values should preserve their format for YAML 1.2 compliance', () => {
    const testCases = [
      { input: 'true', expected: 'true' },
      { input: 'True', expected: 'True' },
      { input: 'TRUE', expected: 'TRUE' },
      { input: 'false', expected: 'false' },
      { input: 'False', expected: 'False' },
      { input: 'FALSE', expected: 'FALSE' }
    ];
    
    for (const {input, expected} of testCases) {
      // Reset and set new input
      process.env = {};
      // GitHub Actions preserves hyphens in environment variable names
      process.env['INPUT_BOOLEAN-INPUT'] = input;
      
      const env = runner.getWrappedActionEnv('/mock/action/dir');
      expect(env['INPUT_BOOLEAN-INPUT']).toBe(expected);
    }
  });
  
  test('4. Witness-specific parameters should be filtered out', () => {
    // Set witness parameters only
    process.env = {
      INPUT_STEP: 'test-step',
      INPUT_WITNESS_VERSION: '0.1.0',
      INPUT_ACTION_REF: 'owner/repo@ref'
    };
    
    const env = runner.getWrappedActionEnv('/mock/action/dir');
    
    // Verify witness params were preserved but not counted as passed inputs
    expect(env.INPUT_STEP).toBe('test-step');
    expect(env.INPUT_WITNESS_VERSION).toBe('0.1.0');
    expect(env.INPUT_ACTION_REF).toBe('owner/repo@ref');
    
    // Default inputs should still be applied
    expect(env['INPUT_STRING-INPUT']).toBe('default string value');
    
    // Verify filtering logic
    const witnessParamsRegex = /step|witness_version|action-ref/;
    const infoMessages = mockCore.info.mock.calls.map(call => call[0]);
    const passedInputsMessage = infoMessages.find(msg => msg.includes('Passing direct input'));
    
    // Verify that witness parameters are not mentioned in the input count
    expect(passedInputsMessage).not.toMatch(witnessParamsRegex);
  });
  
});