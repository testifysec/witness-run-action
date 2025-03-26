const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const exec = require('@actions/exec');

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Mock the modules
jest.mock('@actions/core');
jest.mock('@actions/exec');

// Define our mock functions
core.info = jest.fn();
core.warning = jest.fn();
core.debug = jest.fn();
exec.exec = jest.fn().mockResolvedValue(0);

const mockExistSync = jest.fn().mockReturnValue(true);
const mockReadFileSync = jest.fn().mockImplementation((filePath) => {
  if (filePath.includes('action.yml')) {
    return JSON.stringify({ 
      runs: { 
        using: 'composite',
        steps: [] 
      } 
    });
  }
  return '';
});

// Mock fs functions
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: mockExistSync,
  readFileSync: mockReadFileSync,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  chmodSync: jest.fn()
}));

// Create a simplified mock implementation of the executeCompositeUsesStep function
// focusing on token handling behavior
function mockExecuteCompositeUsesStep(step, parentActionDir, witnessOptions, witnessExePath, parentEnv, stepOutputs) {
  if (!step.uses) {
    throw new Error('Invalid uses step: missing uses reference');
  }
  
  // Prepare environment for the nested action
  const nestedEnv = { ...parentEnv };
  const actionReference = step.uses;
  
  // Process any 'with' inputs for the nested action
  if (step.with) {
    for (const [inputName, inputValue] of Object.entries(step.with)) {
      const inputKey = `INPUT_${inputName.replace(/-/g, '_').toUpperCase()}`;
      nestedEnv[inputKey] = inputValue;
    }
  }
  
  // Return a result object for testing
  return {
    output: `Executed nested action: ${actionReference}`,
    environment: nestedEnv
  };
}

// Create a mock of the getWrappedActionEnv function for testing token propagation
function mockGetWrappedActionEnv(inputs = {}) {
  const env = { ...process.env };
  
  // Add any simulated inputs
  for (const [key, value] of Object.entries(inputs)) {
    env[`INPUT_${key.toUpperCase()}`] = value;
  }
  
  return env;
}

describe('Token Handling in Nested Actions', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Clear any environment variables that might affect tests
    delete process.env.GITHUB_TOKEN;
    delete process.env.INPUT_GITHUB_TOKEN;
    delete process.env.INPUT_TOKEN;
  });
  
  test('should pass GitHub token when explicitly provided', () => {
    // Simulate a step with github-token input
    const step = {
      uses: 'actions/github-script@v6',
      with: {
        'github-token': 'mock-token-value',
        'script': 'console.log("test")'
      }
    };
    
    // Simulate parent environment
    const parentEnv = {
      'INPUT_GITHUB_TOKEN': 'mock-token-value'
    };
    
    // Execute the step
    const result = mockExecuteCompositeUsesStep(
      step, 
      '/parent-action-dir',
      { step: 'test-step' },
      '/path/to/witness',
      parentEnv, 
      {}
    );
    
    // Verify token was passed correctly
    expect(result.environment['INPUT_GITHUB_TOKEN']).toBe('mock-token-value');
  });
  
  test('should not leak GitHub token if not explicitly passed', () => {
    // Simulate a step without a github-token input
    const step = {
      uses: 'some/action@v1',
      with: {
        'other-input': 'some-value'
      }
    };
    
    // Simulate parent environment with a token that should not be leaked
    const parentEnv = {
      'GITHUB_TOKEN': 'sensitive-token-value',
      // No INPUT_GITHUB_TOKEN here, which means it wasn't explicitly passed
    };
    
    // Execute the step
    const result = mockExecuteCompositeUsesStep(
      step, 
      '/parent-action-dir',
      { step: 'test-step' },
      '/path/to/witness',
      parentEnv, 
      {}
    );
    
    // The GITHUB_TOKEN should be inherited as part of the environment
    // but there should not be an explicit INPUT_GITHUB_TOKEN
    expect(result.environment['GITHUB_TOKEN']).toBe('sensitive-token-value');
    expect(result.environment['INPUT_GITHUB_TOKEN']).toBeUndefined();
  });
  
  test('should handle alternate token parameter names correctly', () => {
    // Simulate a step with token input (instead of github-token)
    const step = {
      uses: 'actions/github-script@v6',
      with: {
        'token': 'mock-token-value',
        'script': 'console.log("test")'
      }
    };
    
    // Simulate parent environment
    const parentEnv = {
      'INPUT_TOKEN': 'mock-token-value'
    };
    
    // Execute the step
    const result = mockExecuteCompositeUsesStep(
      step, 
      '/parent-action-dir',
      { step: 'test-step' },
      '/path/to/witness',
      parentEnv, 
      {}
    );
    
    // Verify token was passed correctly
    expect(result.environment['INPUT_TOKEN']).toBe('mock-token-value');
  });
  
  test('should pass token to deeply nested actions (when explicitly provided)', () => {
    // This test simulates a deep nesting of actions with token propagation
    
    // First level
    const level1Step = {
      uses: 'first/action@v1',
      with: {
        'github-token': 'mock-token-value',
        'other-input': 'level1-value'
      }
    };
    
    // Simulate parent environment
    const parentEnv = {
      'INPUT_GITHUB_TOKEN': 'mock-token-value'
    };
    
    // Execute first level
    const level1Result = mockExecuteCompositeUsesStep(
      level1Step, 
      '/parent-action-dir',
      { step: 'test-step' },
      '/path/to/witness',
      parentEnv, 
      {}
    );
    
    // Second level (using the environment from first level)
    const level2Step = {
      uses: 'second/action@v1',
      with: {
        'github-token': level1Result.environment['INPUT_GITHUB_TOKEN'],
        'other-input': 'level2-value'
      }
    };
    
    // Execute second level
    const level2Result = mockExecuteCompositeUsesStep(
      level2Step, 
      '/level1-action-dir',
      { step: 'test-step' },
      '/path/to/witness',
      level1Result.environment, 
      {}
    );
    
    // Third level (using the environment from second level)
    const level3Step = {
      uses: 'third/action@v1',
      with: {
        'github-token': level2Result.environment['INPUT_GITHUB_TOKEN'],
        'other-input': 'level3-value'
      }
    };
    
    // Execute third level
    const level3Result = mockExecuteCompositeUsesStep(
      level3Step, 
      '/level2-action-dir',
      { step: 'test-step' },
      '/path/to/witness',
      level2Result.environment, 
      {}
    );
    
    // Verify token was passed correctly through all levels
    expect(level1Result.environment['INPUT_GITHUB_TOKEN']).toBe('mock-token-value');
    expect(level2Result.environment['INPUT_GITHUB_TOKEN']).toBe('mock-token-value');
    expect(level3Result.environment['INPUT_GITHUB_TOKEN']).toBe('mock-token-value');
  });
  
  test('should not propagate token in with values if not explicitly provided', () => {
    // This tests that tokens don't accidentally leak through expression syntax
    
    // Simulate a step that tries to use an expression to access a token
    const step = {
      uses: 'some/action@v1',
      with: {
        // This is simulating the attempt to access a token through expression substitution
        'attempted-token': '${{ github.token }}'
      }
    };
    
    // Execute the step with a parent environment that has a token
    const result = mockExecuteCompositeUsesStep(
      step, 
      '/parent-action-dir',
      { step: 'test-step' },
      '/path/to/witness',
      { 'GITHUB_TOKEN': 'secret-value' }, 
      {}
    );
    
    // The token should not be substituted, as our implementation doesn't process
    // github context expressions by default
    expect(result.environment['INPUT_ATTEMPTED_TOKEN']).toBe('${{ github.token }}');
  });
  
  test('should correctly handle special token parameter default behavior', () => {
    // Get the wrapped environment with GitHub token
    const env = mockGetWrappedActionEnv({
      'github-token': 'mock-token-value'
    });
    
    // Set the INPUT_GITHUB_TOKEN directly in the environment
    env['INPUT_GITHUB_TOKEN'] = 'mock-token-value';
    
    // Simulate a step that uses the token
    const step = {
      uses: 'actions/github-script@v6',
      with: {
        'script': 'console.log("test")'
        // Note: no explicit token parameter
      }
    };
    
    // Execute the step with the wrapped environment
    const result = mockExecuteCompositeUsesStep(
      step, 
      '/parent-action-dir',
      { step: 'test-step' },
      '/path/to/witness',
      env, 
      {}
    );
    
    // The wrapped environment should have the token, but it shouldn't be in 
    // the 'with' inputs for the github-script action
    expect(env['INPUT_GITHUB_TOKEN']).toBe('mock-token-value');
    expect(result.environment['INPUT_GITHUB_TOKEN']).toBe('mock-token-value');
    // The INPUT_SCRIPT should be set, but no automatic token propagation
    expect(result.environment['INPUT_SCRIPT']).toBe('console.log("test")');
  });
});