/**
 * Tests for actionSetup.js module
 */
const path = require('path');
const os = require('os');

// Import helpers
const mockCore = require('./helpers/mockCore');
const mockExec = require('./helpers/mockExec');

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Mock dependencies
jest.mock('@actions/core', () => mockCore);
jest.mock('@actions/exec', () => mockExec);

// Mock fs with simpler approach
const mockFs = {
  existsSync: jest.fn(),
  mkdtempSync: jest.fn(),
  rmdirSync: jest.fn()
};
jest.mock('fs', () => mockFs);

// Mock os
jest.mock('os', () => ({
  tmpdir: jest.fn().mockReturnValue('/mock-tmp-dir')
}));

// Mock path with a simpler implementation
const mockPath = {
  join: jest.fn(),
  startsWith: jest.fn().mockReturnValue(true)
};
jest.mock('path', () => mockPath);

// Add startsWith to strings explicitly for our test
const originalStartsWith = String.prototype.startsWith;
String.prototype.startsWith = function(str) {
  // Always return true for our test paths to avoid security errors
  if (this.valueOf().includes('/action-dir') && 
      (str === '/action-dir')) {
    return true;
  }
  return originalStartsWith.call(this, str);
};

// Mock assembleWitnessArgs
const mockAssembleWitnessArgs = jest.fn();
jest.mock('../src/attestation/assembleWitnessArgs', () => mockAssembleWitnessArgs);

// Now import the module to test
const { downloadAndSetupAction, downloadActionWithWitness, getActionYamlPath, cleanUpDirectory } = require('../src/actions/actionSetup');

describe('Action Setup Tests', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    mockCore.resetAllMocks();
    mockExec.resetAllMocks();
    
    // Set up common test environment
    process.env.GITHUB_WORKSPACE = '/mock-workspace';
    
    // Default mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
  });

  afterEach(() => {
    // Restore any monkey patching
    jest.restoreAllMocks();
  });

  describe('downloadAndSetupAction', () => {
    test('should download and setup an action correctly', async () => {
      // Setup
      const tempDirPath = '/mock-tmp-dir/action-12345';
      
      // Mock mkdtempSync
      mockFs.mkdtempSync.mockReturnValue(tempDirPath);
      
      // Mock exec to simulate successful git commands with the new approach
      mockExec.exec.mockResolvedValueOnce(0); // git clone with --depth=1 and --branch

      // Call the function
      const result = await downloadAndSetupAction('actions/checkout@v3');

      // Verify the result
      expect(result).toBe(tempDirPath);

      // Verify the correct git commands were executed with the new parameters
      expect(mockExec.exec).toHaveBeenCalledWith(
        'git', 
        [
          'clone',
          '--depth=1',
          '--branch', 'v3',
          'https://github.com/actions/checkout.git',
          tempDirPath
        ]
      );
    });

    test('should handle fallback to regular clone and checkout', async () => {
      // Setup
      const tempDirPath = '/mock-tmp-dir/action-12345';
      mockFs.mkdtempSync.mockReturnValue(tempDirPath);
      
      // Mock exec to simulate branch clone failure then success with regular approach
      mockExec.exec.mockRejectedValueOnce(new Error('Branch not found')); // First attempt fails
      mockExec.exec.mockResolvedValueOnce(0); // Regular clone succeeds
      mockExec.exec.mockResolvedValueOnce(0); // Checkout succeeds

      // Call the function
      const result = await downloadAndSetupAction('actions/checkout@v3');

      // Verify the result
      expect(result).toBe(tempDirPath);

      // Verify both approaches were tried
      expect(mockExec.exec).toHaveBeenNthCalledWith(
        1,
        'git', 
        [
          'clone',
          '--depth=1',
          '--branch', 'v3',
          'https://github.com/actions/checkout.git',
          tempDirPath
        ]
      );
      expect(mockExec.exec).toHaveBeenNthCalledWith(
        2,
        'git', 
        [
          'clone',
          'https://github.com/actions/checkout.git',
          tempDirPath
        ]
      );
      expect(mockExec.exec).toHaveBeenNthCalledWith(
        3,
        'git', 
        ['checkout', 'v3'], 
        { cwd: tempDirPath }
      );
    });

    test('should throw an error for invalid action reference', async () => {
      // Call the function with an invalid reference
      await expect(downloadAndSetupAction('invalid-ref')).rejects.toThrow(
        'Invalid action reference: invalid-ref. Format should be owner/repo@ref'
      );
    });

    test('should handle git clone failure', async () => {
      // Setup
      const tempDirPath = '/mock-tmp-dir/action-12345';
      mockFs.mkdtempSync.mockReturnValue(tempDirPath);
      
      // Mock exec to simulate git clone failure in both approaches
      mockExec.exec.mockRejectedValueOnce(new Error('Branch clone failed')); // First attempt fails
      mockExec.exec.mockRejectedValueOnce(new Error('Git clone failed')); // Second attempt fails

      // Call the function and expect an error
      await expect(downloadAndSetupAction('actions/checkout@v3')).rejects.toThrow('Git clone failed');
    });

    test('should handle git checkout failure', async () => {
      // Setup
      const tempDirPath = '/mock-tmp-dir/action-12345';
      mockFs.mkdtempSync.mockReturnValue(tempDirPath);
      
      // Mock exec to simulate git clone success but checkout failure
      mockExec.exec.mockRejectedValueOnce(new Error('Branch clone failed')); // First attempt fails
      mockExec.exec.mockResolvedValueOnce(0); // Regular clone succeeds
      mockExec.exec.mockRejectedValueOnce(new Error('Git checkout failed')); // Checkout fails

      // Call the function and expect an error
      await expect(downloadAndSetupAction('actions/checkout@v3')).rejects.toThrow('Git checkout failed');
    });
  });

  describe('getActionYamlPath', () => {
    test('should return action.yml path if it exists', () => {
      // Setup
      const actionDir = '/action-dir';
      const actionYmlPath = '/action-dir/action.yml';
      const actionYamlPath = '/action-dir/action.yaml';
      
      mockPath.join.mockReturnValueOnce(actionYmlPath)
               .mockReturnValueOnce(actionYamlPath);
      
      mockFs.existsSync.mockImplementation((path) => {
        return path === actionYmlPath;
      });

      // Execute
      const result = getActionYamlPath(actionDir);

      // Verify
      expect(result).toBe(actionYmlPath);
      expect(mockFs.existsSync).toHaveBeenCalledWith(actionYmlPath);
    });

    test('should return action.yaml path if action.yml does not exist', () => {
      // Setup
      const actionDir = '/action-dir';
      const actionYmlPath = '/action-dir/action.yml';
      const actionYamlPath = '/action-dir/action.yaml';
      
      mockPath.join.mockReturnValueOnce(actionYmlPath)
               .mockReturnValueOnce(actionYamlPath);
      
      mockFs.existsSync.mockImplementation((path) => {
        return path === actionYamlPath;
      });

      // Execute
      const result = getActionYamlPath(actionDir);

      // Verify
      expect(result).toBe(actionYamlPath);
    });

    test('should throw an error if neither action.yml nor action.yaml exists', () => {
      // Setup
      const actionDir = '/action-dir';
      const actionYmlPath = '/action-dir/action.yml';
      const actionYamlPath = '/action-dir/action.yaml';
      
      mockPath.join.mockReturnValueOnce(actionYmlPath)
               .mockReturnValueOnce(actionYamlPath);
      
      mockFs.existsSync.mockReturnValue(false);

      // Execute and verify
      expect(() => getActionYamlPath(actionDir)).toThrow(
        'Could not find action.yml or action.yaml in the action repository'
      );
    });

    test('should throw an error if actionDir is not a string', () => {
      // Execute and verify
      expect(() => getActionYamlPath(null)).toThrow('Invalid action directory: null');
      expect(() => getActionYamlPath(undefined)).toThrow('Invalid action directory: undefined');
      expect(() => getActionYamlPath(123)).toThrow('Invalid action directory: 123');
    });
  });

  describe('cleanUpDirectory', () => {
    test('should remove the directory recursively', () => {
      // Setup
      const dirPath = '/temp-dir';
      
      // Execute
      cleanUpDirectory(dirPath);

      // Verify
      expect(mockFs.rmdirSync).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    test('should handle errors and log a warning', () => {
      // Setup
      const dirPath = '/temp-dir';
      const error = new Error('Directory removal failed');
      mockFs.rmdirSync.mockImplementation(() => {
        throw error;
      });

      // Execute
      cleanUpDirectory(dirPath);

      // Verify
      expect(mockCore.warning).toHaveBeenCalledWith(
        `Failed to clean up action directory: ${error.message}`
      );
    });
  });

  describe('downloadActionWithWitness', () => {
    test('should download action and create attestation', async () => {
      // Setup
      const tempDirPath = '/mock-tmp-dir/action-12345';
      const actionRef = 'actions/checkout@v3';
      const witnessExePath = '/path/to/witness';
      const witnessOptions = {
        step: 'test-step',
        attestations: ['product']
      };
      
      // Mock mkdtempSync
      mockFs.mkdtempSync.mockReturnValue(tempDirPath);
      
      // Mock exec to simulate successful git commands
      mockExec.exec.mockResolvedValueOnce(0) // git clone success
               .mockResolvedValueOnce(0); // witness attestation success
      
      // Mock assembleWitnessArgs
      const mockWitnessArgs = ['run', '-s=test-step-download', '-a=git', '-a=github', '-a=product', '--', 'git', 'rev-parse', 'HEAD'];
      mockAssembleWitnessArgs.mockReturnValue(mockWitnessArgs);

      // Call the function
      const result = await downloadActionWithWitness(actionRef, witnessExePath, witnessOptions);

      // Verify the result structure
      expect(result).toHaveProperty('actionDir', tempDirPath);
      expect(result).toHaveProperty('attestationOutput');
      expect(result).toHaveProperty('attestationFile');
      
      // Verify the correct git commands were executed
      expect(mockExec.exec).toHaveBeenNthCalledWith(
        1,
        'git', 
        [
          'clone',
          '--depth=1',
          '--branch', 'v3',
          'https://github.com/actions/checkout.git',
          tempDirPath
        ]
      );
      
      // Verify witness was called correctly
      expect(mockExec.exec).toHaveBeenNthCalledWith(
        2,
        witnessExePath,
        mockWitnessArgs,
        expect.objectContaining({
          cwd: tempDirPath,
          env: process.env
        })
      );
      
      // Verify witness args were constructed with the right options
      expect(mockAssembleWitnessArgs).toHaveBeenCalledWith(
        expect.objectContaining({
          attestations: ['git', 'github'],
          workingdir: tempDirPath
        }),
        ['git', 'rev-parse', 'HEAD']
      );
    });

    test('should handle fallback to regular clone and checkout', async () => {
      // Setup
      const tempDirPath = '/mock-tmp-dir/action-12345';
      const actionRef = 'actions/checkout@v3';
      const witnessExePath = '/path/to/witness';
      const witnessOptions = {
        step: 'test-step',
        attestations: []
      };
      
      // Mock mkdtempSync
      mockFs.mkdtempSync.mockReturnValue(tempDirPath);
      
      // Mock exec to simulate branch clone failure then success with regular approach
      mockExec.exec.mockRejectedValueOnce(new Error('Branch not found')) // First attempt fails
               .mockResolvedValueOnce(0) // Regular clone succeeds
               .mockResolvedValueOnce(0) // Checkout succeeds
               .mockResolvedValueOnce(0); // witness attestation success
      
      // Mock assembleWitnessArgs
      const mockWitnessArgs = ['run', '-s=test-step-download', '-a=git', '-a=github', '--', 'git', 'rev-parse', 'HEAD'];
      mockAssembleWitnessArgs.mockReturnValue(mockWitnessArgs);

      // Call the function
      const result = await downloadActionWithWitness(actionRef, witnessExePath, witnessOptions);

      // Verify the result structure
      expect(result).toHaveProperty('actionDir', tempDirPath);
      
      // Verify both clone approaches were tried
      expect(mockExec.exec).toHaveBeenNthCalledWith(
        1,
        'git', 
        [
          'clone',
          '--depth=1',
          '--branch', 'v3',
          'https://github.com/actions/checkout.git',
          tempDirPath
        ]
      );
      expect(mockExec.exec).toHaveBeenNthCalledWith(
        2,
        'git', 
        [
          'clone',
          'https://github.com/actions/checkout.git',
          tempDirPath
        ]
      );
      expect(mockExec.exec).toHaveBeenNthCalledWith(
        3,
        'git', 
        ['checkout', 'v3'], 
        { cwd: tempDirPath }
      );
      
      // Verify witness was called correctly
      expect(mockExec.exec).toHaveBeenNthCalledWith(
        4,
        witnessExePath,
        mockWitnessArgs,
        expect.objectContaining({
          cwd: tempDirPath
        })
      );
    });

    test('should throw an error for invalid action reference', async () => {
      const witnessExePath = '/path/to/witness';
      const witnessOptions = { step: 'test-step' };
      
      // Call the function with an invalid reference
      await expect(downloadActionWithWitness('invalid-ref', witnessExePath, witnessOptions)).rejects.toThrow(
        'Invalid action reference: invalid-ref. Format should be owner/repo@ref'
      );
    });

    test('should handle git clone complete failure', async () => {
      // Setup
      const tempDirPath = '/mock-tmp-dir/action-12345';
      const actionRef = 'actions/checkout@v3';
      const witnessExePath = '/path/to/witness';
      const witnessOptions = { step: 'test-step' };
      
      // Mock mkdtempSync
      mockFs.mkdtempSync.mockReturnValue(tempDirPath);
      
      // Mock exec to simulate git clone failure in both approaches
      mockExec.exec.mockRejectedValueOnce(new Error('Branch clone failed')) // First attempt fails
               .mockRejectedValueOnce(new Error('Git clone failed')); // Second attempt fails

      // Call the function and expect an error
      await expect(downloadActionWithWitness(actionRef, witnessExePath, witnessOptions)).rejects.toThrow(
        'Git clone failed'
      );
    });
  });
});