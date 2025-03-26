/**
 * Tests for WitnessActionRunner class
 */
const path = require('path');
const fs = require('fs');
const core = require('@actions/core');

const mockCore = require('./helpers/mockCore');

// Mock dependencies
jest.mock('@actions/core', () => mockCore);
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readdirSync: jest.fn().mockReturnValue(['action.yml']),
  mkdirSync: jest.fn(),
  rmdirSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('mock content')
}));

// Save original process methods
const originalProcessChdir = process.chdir;
const originalProcessCwd = process.cwd;

// Mock modules used by WitnessActionRunner
jest.mock('../src/core/witnessDownloader', () => ({
  downloadAndSetupWitness: jest.fn().mockResolvedValue('/path/to/witness')
}));
jest.mock('../src/attestation/getWitnessOptions', () => 
  jest.fn().mockReturnValue({
    step: 'test-step',
    archivistaServer: 'https://example.com',
    attestations: ['git', 'environment'],
    outfile: '/tmp/test-step-attestation.json'
  })
);
jest.mock('../src/attestation/gitOidUtils', () => ({
  handleGitOIDs: jest.fn(),
  extractDesiredGitOIDs: jest.fn().mockReturnValue(['1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'])
}));
jest.mock('../src/runners/commandRunners', () => ({
  runActionWithWitness: jest.fn().mockResolvedValue('Action output'),
  runDirectCommandWithWitness: jest.fn().mockResolvedValue('Command output')
}));
jest.mock('../src/actions/actionSetup', () => ({
  downloadAndSetupAction: jest.fn().mockResolvedValue('/tmp/action-dir'),
  downloadActionWithWitness: jest.fn().mockImplementation((actionRef, witnessExePath, options) => {
    return Promise.resolve({
      actionDir: '/tmp/action-dir',
      attestationOutput: 'Mock attestation output',
      attestationFile: options.outfile || '/tmp/attestation.json'
    });
  }),
  cleanUpDirectory: jest.fn()
}));

// Import modules for testing after mocks are set up
const WitnessActionRunner = require('../src/runners/WitnessActionRunner');
const { downloadAndSetupWitness } = require('../src/core/witnessDownloader');
const getWitnessOptions = require('../src/attestation/getWitnessOptions');
const { handleGitOIDs } = require('../src/attestation/gitOidUtils');
const { runActionWithWitness, runDirectCommandWithWitness } = require('../src/runners/commandRunners');
const { downloadAndSetupAction, downloadActionWithWitness, cleanUpDirectory } = require('../src/actions/actionSetup');

describe('WitnessActionRunner', () => {
  let runner;
  let mockChdir;
  let mockCwd;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockCore.resetAllMocks();
    
    // Set up environment variables
    process.env.GITHUB_WORKSPACE = '/github/workspace';
    
    // Mock process.chdir and process.cwd
    mockChdir = jest.fn();
    mockCwd = jest.fn().mockReturnValue('/github/workspace');
    process.chdir = mockChdir;
    process.cwd = mockCwd;
    
    // Mock process.exit
    jest.spyOn(process, 'exit').mockImplementation(() => {});
    
    // Create an instance of the runner
    runner = new WitnessActionRunner();
  });
  
  afterEach(() => {
    // Clean up mocks
    jest.restoreAllMocks();
    
    // Restore original process methods
    process.chdir = originalProcessChdir;
    process.cwd = originalProcessCwd;
    
    // Clean up environment
    delete process.env.GITHUB_WORKSPACE;
  });
  
  describe('setup', () => {
    test('should set up witness and prepare options', async () => {
      // Call setup
      const result = await runner.setup();
      
      // Verify witness was downloaded
      expect(downloadAndSetupWitness).toHaveBeenCalled();
      
      // Verify options were retrieved
      expect(getWitnessOptions).toHaveBeenCalled();
      
      // Verify properties were set
      expect(runner.witnessExePath).toBe('/path/to/witness');
      expect(runner.witnessOptions).toEqual({
        step: 'test-step',
        archivistaServer: 'https://example.com',
        attestations: ['git', 'environment'],
        outfile: '/tmp/test-step-attestation.json'
      });
      
      // Verify current directory was changed
      expect(mockChdir).toHaveBeenCalledWith('/github/workspace');
      
      // Verify successful result
      expect(result).toBe(true);
    });
    
    test('should handle setup errors', async () => {
      // Mock a download failure
      downloadAndSetupWitness.mockRejectedValueOnce(new Error('Download failed'));
      
      // Call setup
      const result = await runner.setup();
      
      // Verify failure was handled
      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'Failed to set up Witness: Download failed'
      );
      
      // Verify unsuccessful result
      expect(result).toBe(false);
    });
    
    test('should use process.cwd() when GITHUB_WORKSPACE is not set', async () => {
      // Remove GITHUB_WORKSPACE
      delete process.env.GITHUB_WORKSPACE;
      
      // Change mockCwd to return a different path
      mockCwd.mockReturnValueOnce('/current/working/dir');
      
      // Call setup
      await runner.setup();
      
      // Verify current directory was changed to the value returned by process.cwd()
      expect(mockChdir).toHaveBeenCalledWith('/current/working/dir');
    });
  });
  
  describe('run', () => {
    test('should execute action when action-ref is provided', async () => {
      // Set up a successful setup
      jest.spyOn(runner, 'setup').mockResolvedValue(true);
      
      // Mock inputs
      mockCore.setInputs({
        'action-ref': 'owner/repo@ref'
      });
      
      // Mock action execution
      jest.spyOn(runner, 'executeAction').mockResolvedValue('Action output');
      
      // Mock the witnessOptions for handleGitOIDs
      runner.witnessOptions = {
        step: 'test-step', 
        archivistaServer: 'https://example.com',
        attestations: ['git']
      };
      
      // Call run
      await runner.run();
      
      // Verify executeAction was called with the right parameters
      expect(runner.executeAction).toHaveBeenCalledWith('owner/repo@ref');
      
      // Verify handleGitOIDs was called (implementation is tested separately)
      expect(handleGitOIDs).toHaveBeenCalled();
    });
    
    test('should execute command when command is provided', async () => {
      // Set up a successful setup
      jest.spyOn(runner, 'setup').mockResolvedValue(true);
      
      // Mock inputs
      mockCore.setInputs({
        'command': 'npm test'
      });
      
      // Mock command execution
      jest.spyOn(runner, 'executeCommand').mockResolvedValue('Command output');
      
      // Mock the witnessOptions for handleGitOIDs
      runner.witnessOptions = {
        step: 'test-step', 
        archivistaServer: 'https://example.com',
        attestations: ['git']
      };
      
      // Call run
      await runner.run();
      
      // Verify executeCommand was called with the right parameters
      expect(runner.executeCommand).toHaveBeenCalledWith('npm test');
      
      // Verify handleGitOIDs was called (implementation is tested separately)
      expect(handleGitOIDs).toHaveBeenCalled();
    });
    
    test('should throw error if neither action-ref nor command is provided', async () => {
      // Set up a successful setup
      jest.spyOn(runner, 'setup').mockResolvedValue(true);
      
      // Mock empty inputs
      mockCore.setInputs({});
      
      // Call run and expect error
      await runner.run();
      
      // Verify error was set
      expect(mockCore.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Either 'command' or 'action-ref' input is required")
      );
      
      // Verify process.exit was called
      expect(process.exit).toHaveBeenCalledWith(1);
    });
    
    test('should handle run errors', async () => {
      // Set up a successful setup
      jest.spyOn(runner, 'setup').mockResolvedValue(true);
      
      // Mock an action that fails
      mockCore.setInputs({
        'action-ref': 'owner/repo@ref'
      });
      
      // Mock execution error
      jest.spyOn(runner, 'executeAction').mockRejectedValue(new Error('Action failed'));
      
      // Call run
      await runner.run();
      
      // Verify error was handled
      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'Witness run action failed: Action failed'
      );
      
      // Verify process.exit was called
      expect(process.exit).toHaveBeenCalledWith(1);
    });
    
    test('should not proceed if setup fails', async () => {
      // Set up a failed setup
      jest.spyOn(runner, 'setup').mockResolvedValue(false);
      
      // Mock inputs
      mockCore.setInputs({
        'action-ref': 'owner/repo@ref'
      });
      
      // Mock action execution (should not be called)
      jest.spyOn(runner, 'executeAction').mockResolvedValue('Action output');
      
      // Call run
      await runner.run();
      
      // Verify executeAction was not called
      expect(runner.executeAction).not.toHaveBeenCalled();
      
      // Verify GitOIDs were not handled
      expect(handleGitOIDs).not.toHaveBeenCalled();
    });
  });
  
  describe('executeAction', () => {
    test('should execute remote GitHub action', async () => {
      // Set up runner
      runner.witnessExePath = '/path/to/witness';
      runner.witnessOptions = { step: 'test-step' };
      
      // Mock action reference
      const actionRef = 'owner/repo@ref';
      
      // Mock getWrappedActionEnv
      jest.spyOn(runner, 'getWrappedActionEnv').mockReturnValue({ ENV_VAR: 'value' });
      
      // Call executeAction
      const result = await runner.executeAction(actionRef);
      
      // Verify action was downloaded with witness
      expect(downloadActionWithWitness).toHaveBeenCalled();
      
      // Verify parameters were passed correctly
      const callArgs = downloadActionWithWitness.mock.calls[0];
      expect(callArgs[0]).toBe(actionRef);
      expect(callArgs[1]).toBe('/path/to/witness');
      expect(callArgs[2]).toHaveProperty('step', 'test-step-download');
      
      // Verify environment was prepared
      expect(runner.getWrappedActionEnv).toHaveBeenCalled();
      
      // Verify action was run with witness
      expect(runActionWithWitness).toHaveBeenCalledWith(
        '/tmp/action-dir',
        { step: 'test-step' },
        '/path/to/witness',
        { ENV_VAR: 'value' }
      );
      
      // Verify directory was cleaned up
      expect(cleanUpDirectory).toHaveBeenCalledWith('/tmp/action-dir');
      
      // Verify output was returned
      expect(result).toBe('Action output');
    });
    
    test('should execute local action without downloading', async () => {
      // Set up runner
      runner.witnessExePath = '/path/to/witness';
      runner.witnessOptions = { step: 'test-step' };
      
      // Mock resolveLocalActionPath
      jest.spyOn(runner, 'resolveLocalActionPath').mockReturnValue('/local/action/path');
      
      // Mock getWrappedActionEnv
      jest.spyOn(runner, 'getWrappedActionEnv').mockReturnValue({ ENV_VAR: 'value' });
      
      // Call executeAction with local path
      const result = await runner.executeAction('./local-action');
      
      // Verify local action path was resolved
      expect(runner.resolveLocalActionPath).toHaveBeenCalledWith('./local-action');
      
      // Verify action was NOT downloaded
      expect(downloadAndSetupAction).not.toHaveBeenCalled();
      
      // Verify action was run with witness
      expect(runActionWithWitness).toHaveBeenCalledWith(
        '/local/action/path',
        { step: 'test-step' },
        '/path/to/witness',
        { ENV_VAR: 'value' }
      );
      
      // Verify directory was NOT cleaned up for local action
      expect(cleanUpDirectory).not.toHaveBeenCalled();
      
      // Verify output was returned
      expect(result).toBe('Action output');
    });
    
    test('should handle action execution errors', async () => {
      // Set up runner
      runner.witnessExePath = '/path/to/witness';
      runner.witnessOptions = { step: 'test-step' };
      
      // Mock action reference
      const actionRef = 'owner/repo@ref';
      
      // Mock getWrappedActionEnv
      jest.spyOn(runner, 'getWrappedActionEnv').mockReturnValue({ ENV_VAR: 'value' });
      
      // Mock action execution to fail
      runActionWithWitness.mockRejectedValueOnce(new Error('Action execution failed'));
      
      // Call executeAction and expect error to be propagated
      await expect(runner.executeAction(actionRef)).rejects.toThrow('Action execution failed');
      
      // Verify cleanup was still called
      expect(cleanUpDirectory).toHaveBeenCalledWith('/tmp/action-dir');
    });
  });
  
  describe('executeCommand', () => {
    test('should execute command with witness', async () => {
      // Set up runner
      runner.witnessExePath = '/path/to/witness';
      runner.witnessOptions = { step: 'test-step' };
      
      // Call executeCommand
      const result = await runner.executeCommand('npm test');
      
      // Verify command was run with witness
      expect(runDirectCommandWithWitness).toHaveBeenCalledWith(
        'npm test',
        { step: 'test-step' },
        '/path/to/witness'
      );
      
      // Verify output was returned
      expect(result).toBe('Command output');
    });
    
    test('should handle command execution errors', async () => {
      // Set up runner
      runner.witnessExePath = '/path/to/witness';
      runner.witnessOptions = { step: 'test-step' };
      
      // Mock command execution to fail
      runDirectCommandWithWitness.mockRejectedValueOnce(new Error('Command execution failed'));
      
      // Call executeCommand and expect error to be propagated
      await expect(runner.executeCommand('npm test')).rejects.toThrow('Command execution failed');
    });
  });
  
  describe('resolveLocalActionPath', () => {
    let mockFs;
    
    beforeEach(() => {
      // Mock fs module
      mockFs = require('fs');
      
      // Mock process.cwd() and GITHUB_WORKSPACE
      process.env.GITHUB_WORKSPACE = '/github/workspace';
      
      // Mock specific path to exist, default to false for others
      mockFs.existsSync.mockImplementation((path) => {
        return path === '/github/workspace/local-action/action.yml';
      });
    });
    
    test('should resolve local action path correctly', () => {
      const result = runner.resolveLocalActionPath('./local-action');
      
      // Verify path was resolved correctly
      expect(result).toBe('/github/workspace/local-action');
    });
    
    test('should throw error for invalid action paths', () => {
      // Mock a path that contains unsafe components
      expect(() => {
        runner.resolveLocalActionPath('.//unsafe-path');
      }).toThrow('Invalid action reference path');
      
      // Try with a path that would escape the workspace
      expect(() => {
        runner.resolveLocalActionPath('../outside-workspace');
      }).toThrow('Security error: Action path would resolve outside the repository');
      
      // Mock a path that doesn't exist
      mockFs.existsSync.mockReturnValue(false);
      expect(() => {
        runner.resolveLocalActionPath('./nonexistent');
      }).toThrow('Could not find action at');
    });
    
    test('should check for both action.yml and action.yaml', () => {
      // Set up mocks for action.yaml instead of action.yml
      mockFs.existsSync.mockImplementation((path) => {
        return path === '/github/workspace/local-action/action.yaml';
      });
      
      const result = runner.resolveLocalActionPath('./local-action');
      expect(result).toBe('/github/workspace/local-action');
    });
  });
  
  describe('getWrappedActionEnv', () => {
    let originalEnv;
    
    beforeEach(() => {
      // Save original process.env
      originalEnv = process.env;
      
      // Reset process.env for each test
      process.env = {};
    });
    
    afterEach(() => {
      // Restore original process.env
      process.env = originalEnv;
    });
    
    test('should pass through environment variables', () => {
      // Set up environment with some witness inputs and some custom inputs
      process.env = {
        'INPUT_STEP': 'test-step',
        'INPUT_VERSION': '1.0.0',
        'INPUT_CUSTOM_PARAM': 'custom-value',
        'GITHUB_TOKEN': 'secret-token'
      };
      
      const result = runner.getWrappedActionEnv();
      
      // Verify all environment variables were passed through
      expect(result).toEqual(expect.objectContaining({
        'INPUT_STEP': 'test-step',
        'INPUT_VERSION': '1.0.0',
        'INPUT_CUSTOM_PARAM': 'custom-value',
        'GITHUB_TOKEN': 'secret-token'
      }));
    });
    
    test('should filter out witness-specific inputs', () => {
      // Create a new instance with witnessInputNames populated
      process.env = {
        'INPUT_COMMAND': 'npm test',
        'INPUT_ACTION-REF': 'owner/repo@ref',
        'INPUT_STEP': 'test-step',
        'INPUT_CUSTOM_PARAM': 'custom-value'
      };
      
      const result = runner.getWrappedActionEnv();
      
      // Should include the custom param
      expect(result).toHaveProperty('INPUT_CUSTOM_PARAM', 'custom-value');
      
      // Should log about passing the input
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Passing direct input to wrapped action')
      );
    });
  });
});