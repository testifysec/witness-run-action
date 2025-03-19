/**
 * Tests for action utility functions
 */
const fs = require('fs');
const path = require('path');

// Create mockFs helper
const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
};

// Mock dependencies before requiring the module under test
jest.mock('fs', () => mockFs);

// Import the module after mocks are set up
const { detectActionType, getActionYamlPath } = require('../src/actions/actionUtils');

describe('detectActionType', () => {
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

describe('getActionYamlPath', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReset();
  });

  test('should return action.yml path when it exists', () => {
    const actionDir = '/path/to/action';
    const expectedPath = path.join(actionDir, 'action.yml');
    
    // Mock action.yml exists
    mockFs.existsSync.mockImplementation((filePath) => {
      return filePath === expectedPath;
    });
    
    const result = getActionYamlPath(actionDir);
    expect(result).toBe(expectedPath);
    expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath);
  });
  
  test('should return action.yaml path when action.yml does not exist', () => {
    const actionDir = '/path/to/action';
    const ymlPath = path.join(actionDir, 'action.yml');
    const yamlPath = path.join(actionDir, 'action.yaml');
    
    // Mock action.yml doesn't exist but action.yaml does
    mockFs.existsSync.mockImplementation((filePath) => {
      return filePath === yamlPath;
    });
    
    const result = getActionYamlPath(actionDir);
    expect(result).toBe(yamlPath);
    expect(mockFs.existsSync).toHaveBeenCalledWith(ymlPath);
    expect(mockFs.existsSync).toHaveBeenCalledWith(yamlPath);
  });
  
  test('should throw error when neither action.yml nor action.yaml exists', () => {
    const actionDir = '/path/to/action';
    
    // Mock neither file exists
    mockFs.existsSync.mockReturnValue(false);
    
    expect(() => getActionYamlPath(actionDir)).toThrow(
      'Could not find action.yml or action.yaml in the action repository'
    );
  });
  
  test('should throw error for invalid action directory', () => {
    // Test with null
    expect(() => getActionYamlPath(null)).toThrow('Invalid action directory');
    
    // Test with undefined
    expect(() => getActionYamlPath(undefined)).toThrow('Invalid action directory');
    
    // Test with non-string
    expect(() => getActionYamlPath(123)).toThrow('Invalid action directory');
  });
  
  test('should throw error if paths resolve outside action directory', () => {
    // Create a safer mock for path.join that only affects specific inputs
    // This avoids potential interference with other tests
    const originalJoin = path.join;
    
    // Track original join calls to maintain proper return values for other paths
    const joinSpy = jest.spyOn(path, 'join').mockImplementation((...parts) => {
      const inputPath = parts.join('/');
      
      // Only manipulate paths for our test case
      if (parts[0] === '/expected/action/dir' && (parts[1] === 'action.yml' || parts[1] === 'action.yaml')) {
        return '/some/other/path/action.yml'; // Return a path outside the action directory
      }
      
      // Default to original behavior for all other paths
      return originalJoin(...parts);
    });
    
    // Execute the test
    expect(() => getActionYamlPath('/expected/action/dir')).toThrow(
      'Security error: Action metadata path resolves outside the action directory'
    );
    
    // Verify our mock was called
    expect(joinSpy).toHaveBeenCalled();
    
    // Clean up by restoring the original path.join
    joinSpy.mockRestore();
  });
});