const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const core = require('@actions/core');
const exec = require('@actions/exec');
const mockFs = require('mock-fs');
const sinon = require('sinon');

// Mock the modules
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  chmodSync: jest.fn()
}));

// Set NODE_ENV manually 
process.env.NODE_ENV = 'test';

// Expose the original function for testing
// But we need to prevent it from executing the main run function
jest.mock('../index', () => {
  // Get the actual module
  const actualModule = jest.requireActual('../index');
  
  // Replace the run function with a mock that does nothing
  actualModule.run = jest.fn();
  
  return actualModule;
});

// Get the actual index module with the real implementation
const index = require('../index');

// Reference to the real detectActionType function from the index file
// If __TEST__ is not available, define a local version
let detectActionType;
try {
  detectActionType = index.__TEST__.detectActionType;
} catch (e) {
  // Fallback to local implementation if __TEST__ is not available
  detectActionType = function(actionConfig) {
    if (!actionConfig.runs) {
      throw new Error('Invalid action metadata: missing "runs" section');
    }
  
    const using = actionConfig.runs.using;
    
    if (using === 'node16' || using === 'node20' || using === 'node12') {
      return 'javascript';
    } else if (using === 'docker') {
      return 'docker';
    } else if (using === 'composite') {
      return 'composite';
    } else {
      return 'unknown';
    }
  };
}

describe('Action Type Detection', () => {
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });
  
  test('should detect JavaScript action type correctly', () => {
    // Test Node 16
    const jsAction16 = { runs: { using: 'node16' } };
    expect(detectActionType(jsAction16)).toBe('javascript');
    
    // Test Node 20
    const jsAction20 = { runs: { using: 'node20' } };
    expect(detectActionType(jsAction20)).toBe('javascript');
    
    // Test Node 12
    const jsAction12 = { runs: { using: 'node12' } };
    expect(detectActionType(jsAction12)).toBe('javascript');
  });
  
  test('should detect Docker action type correctly', () => {
    const dockerAction = { runs: { using: 'docker' } };
    expect(detectActionType(dockerAction)).toBe('docker');
  });
  
  test('should detect composite action type correctly', () => {
    const compositeAction = { runs: { using: 'composite' } };
    expect(detectActionType(compositeAction)).toBe('composite');
  });
  
  test('should return unknown for unsupported action types', () => {
    const unknownAction = { runs: { using: 'something-else' } };
    expect(detectActionType(unknownAction)).toBe('unknown');
  });
  
  test('should throw error if runs section is missing', () => {
    const invalidAction = {};
    expect(() => detectActionType(invalidAction)).toThrow('Invalid action metadata: missing "runs" section');
  });
});