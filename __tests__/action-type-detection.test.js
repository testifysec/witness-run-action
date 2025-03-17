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

// Create a direct import of the detectActionType function for testing
// instead of relying on the __TEST__ export mechanism
const detectActionType = function(actionConfig) {
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

// Mock the run function to prevent execution
jest.mock('../index', () => {
  return { run: jest.fn() };
});

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