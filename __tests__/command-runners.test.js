/**
 * Tests for commandRunners functions
 */
const path = require('path');
const fs = require('fs');
const core = require('@actions/core');
const exec = require('@actions/exec');
const yaml = require('js-yaml');

const mockCore = require('./helpers/mockCore');
const mockExec = require('./helpers/mockExec');

// Mock dependencies
jest.mock('@actions/core', () => mockCore);
jest.mock('@actions/exec', () => mockExec);
const mockFs = {
  readFileSync: jest.fn().mockReturnValue('mock action yaml content'),
  existsSync: jest.fn().mockReturnValue(true)
};
jest.mock('fs', () => mockFs);

const mockYaml = {
  load: jest.fn().mockReturnValue({
    name: 'Test Action',
    runs: { using: 'node20' }
  })
};
jest.mock('js-yaml', () => mockYaml);

// Create a mock for assembleWitnessArgs that respects the input parameters
const mockAssembleWitnessArgs = jest.fn((options, commandArray) => {
  // Return a response based on actual inputs to better simulate real behavior
  const stepArg = options && options.step ? `-s=${options.step}` : '-s=default';
  // Always include the run command and -- separator, then the passed command array
  return ['run', stepArg, '--', ...(commandArray || [])];
});

// Mock modules used by commandRunners
jest.mock('../src/attestation/assembleWitnessArgs', () => mockAssembleWitnessArgs);
jest.mock('../src/actions/actionUtils', () => ({
  detectActionType: jest.fn(),
  getActionYamlPath: jest.fn()
}));
// Create more realistic mocks for actionRunners
const mockRunJsActionWithWitness = jest.fn().mockImplementation(
  (actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv) => {
    // Do basic validation of inputs
    if (!actionDir) throw new Error('actionDir is required');
    if (!actionConfig) throw new Error('actionConfig is required');
    if (!witnessOptions) throw new Error('witnessOptions is required');
    if (!witnessExePath) throw new Error('witnessExePath is required');
    
    // Return different responses based on inputs
    if (actionDir.includes('error')) {
      return Promise.reject(new Error('Failed to run JavaScript action'));
    }
    
    return Promise.resolve(`JavaScript action output from ${actionDir} with ${witnessOptions.step}`);
  }
);

const mockRunCompositeActionWithWitness = jest.fn().mockImplementation(
  (actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv) => {
    // Do basic validation of inputs
    if (!actionDir) throw new Error('actionDir is required');
    if (!actionConfig) throw new Error('actionConfig is required');
    if (!witnessOptions) throw new Error('witnessOptions is required');
    if (!witnessExePath) throw new Error('witnessExePath is required');
    
    // Return different responses based on inputs
    if (actionDir.includes('error')) {
      return Promise.reject(new Error('Failed to run composite action'));
    }
    
    // Check if the action config has steps
    if (!actionConfig.runs || !actionConfig.runs.steps) {
      return Promise.reject(new Error('Invalid composite action configuration: missing steps'));
    }
    
    return Promise.resolve(`Composite action output from ${actionDir} with ${witnessOptions.step}`);
  }
);

jest.mock('../src/actions/actionRunners', () => ({
  runJsActionWithWitness: mockRunJsActionWithWitness,
  runCompositeActionWithWitness: mockRunCompositeActionWithWitness,
  runDockerActionWithWitness: jest.fn().mockImplementation(() => {
    throw new Error('Docker-based actions are not yet supported');
  })
}));

// Import the functions to test after mocks are set up
const { runActionWithWitness, runDirectCommandWithWitness } = require('../src/runners/commandRunners');
const assembleWitnessArgs = require('../src/attestation/assembleWitnessArgs');
const { detectActionType, getActionYamlPath } = require('../src/actions/actionUtils');
const { runJsActionWithWitness, runCompositeActionWithWitness } = require('../src/actions/actionRunners');

describe('commandRunners', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockCore.resetAllMocks();
    mockExec.resetAllMocks();
    
    // Reset fs and yaml mocks
    mockFs.readFileSync.mockReturnValue('mock action yaml content');
    mockFs.existsSync.mockReturnValue(true);
    // Default to a JavaScript action
    mockYaml.load.mockReturnValue({
      name: 'Test Action',
      runs: { using: 'node20' }
    });
    
    // Set up environment
    process.env.GITHUB_WORKSPACE = '/github/workspace';

    // Mock exec to return a successful result by default
    mockExec.exec.mockImplementation((cmd, args, options) => {
      if (options && options.listeners) {
        const stdout = options.listeners.stdout;
        if (stdout) stdout(Buffer.from('Mock output from witness execution'));
      }
      return Promise.resolve(0);
    });
  });
  
  afterEach(() => {
    delete process.env.GITHUB_WORKSPACE;
  });
  
  describe('runDirectCommandWithWitness', () => {
    test('should execute command with witness', async () => {
      // Set up mocks
      const command = 'npm test';
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Execute the function
      const result = await runDirectCommandWithWitness(command, witnessOptions, witnessExePath);
      
      // Verify witness args were assembled
      expect(assembleWitnessArgs).toHaveBeenCalledWith(witnessOptions, ['npm', 'test']);
      
      // Verify exec was called with the right parameters
      expect(mockExec.exec).toHaveBeenCalledWith(
        witnessExePath,
        ['run', '-s=test-step', '--', 'npm', 'test'],
        expect.objectContaining({
          cwd: expect.any(String),
          env: expect.any(Object),
          listeners: expect.any(Object)
        })
      );
      
      // Verify output was captured
      expect(result).toEqual(expect.stringContaining('Mock output from witness execution'));
    });
    
    test('should handle commands with quotes correctly', async () => {
      const command = 'echo "Hello World"';
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      await runDirectCommandWithWitness(command, witnessOptions, witnessExePath);
      
      // Verify command was parsed correctly
      expect(assembleWitnessArgs).toHaveBeenCalledWith(
        witnessOptions, 
        ['echo', '"Hello World"']
      );
    });
    
    test('should handle command execution errors', async () => {
      const command = 'failing-command';
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock exec to throw an error
      mockExec.exec.mockImplementationOnce(() => {
        throw new Error('Command execution failed');
      });
      
      // Expect the error to be propagated
      await expect(
        runDirectCommandWithWitness(command, witnessOptions, witnessExePath)
      ).rejects.toThrow('Command execution failed');
    });
  });
  
  describe('runActionWithWitness', () => {
    test('should detect action type and run JavaScript action', async () => {
      // Set up mocks
      const actionDir = '/path/to/action';
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = { TEST_ENV: 'value' };
      
      // Mock action path and type detection
      getActionYamlPath.mockReturnValue('/path/to/action/action.yml');
      detectActionType.mockReturnValue('javascript');
      
      // Execute the function
      const result = await runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv);
      
      // Verify the right action path was retrieved
      expect(getActionYamlPath).toHaveBeenCalledWith(actionDir);
      
      // Verify yaml was loaded
      expect(mockYaml.load).toHaveBeenCalled();
      
      // Verify action type was detected
      expect(detectActionType).toHaveBeenCalled();
      
      // Verify JS action runner was called
      expect(runJsActionWithWitness).toHaveBeenCalledWith(
        actionDir, 
        expect.any(Object),
        witnessOptions,
        witnessExePath,
        actionEnv
      );
      
      // Verify output was returned with expected format
      expect(result).toBe(`JavaScript action output from ${actionDir} with ${witnessOptions.step}`);
    });
    
    test('should run composite action when detected', async () => {
      // Set up mocks
      const actionDir = '/path/to/action';
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = { TEST_ENV: 'value' };
      
      // Mock action detection as composite
      getActionYamlPath.mockReturnValue('/path/to/action/action.yml');
      detectActionType.mockReturnValue('composite');
      
      // Override the yaml.load mock to return a valid composite action config
      mockYaml.load.mockReturnValue({
        name: 'Test Composite Action',
        runs: { 
          using: 'composite',
          steps: [
            { run: 'echo "Step 1"', shell: 'bash' },
            { run: 'echo "Step 2"', shell: 'bash' }
          ]
        }
      });
      
      // Execute the function
      const result = await runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv);
      
      // Verify composite action runner was called
      expect(runCompositeActionWithWitness).toHaveBeenCalledWith(
        actionDir, 
        expect.any(Object),
        witnessOptions,
        witnessExePath,
        actionEnv
      );
      
      // Verify output was returned with expected format
      expect(result).toBe(`Composite action output from ${actionDir} with ${witnessOptions.step}`);
    });
    
    test('should throw error for unsupported action types', async () => {
      // Set up mocks for a Docker action
      const actionDir = '/path/to/action';
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock docker action type
      getActionYamlPath.mockReturnValue('/path/to/action/action.yml');
      detectActionType.mockReturnValue('docker');
      
      // Execute function and expect error
      await expect(
        runActionWithWitness(actionDir, witnessOptions, witnessExePath, {})
      ).rejects.toThrow('Docker-based actions are not yet supported');
      
      // Try with unknown action type
      detectActionType.mockReturnValue('unknown');
      
      await expect(
        runActionWithWitness(actionDir, witnessOptions, witnessExePath, {})
      ).rejects.toThrow('Unsupported action type: unknown');
    });
    
    test('should handle action runner execution errors', async () => {
      // Set up mocks for an action that will cause an error
      const actionDir = '/path/to/error/action';
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock as JavaScript action
      getActionYamlPath.mockReturnValue('/path/to/error/action/action.yml');
      detectActionType.mockReturnValue('javascript');
      
      // Expect error to be propagated (our mock will throw for paths containing 'error')
      await expect(
        runActionWithWitness(actionDir, witnessOptions, witnessExePath, {})
      ).rejects.toThrow('Failed to run JavaScript action');
      
      // Test composite action error
      detectActionType.mockReturnValue('composite');
      
      // Update config with steps
      mockYaml.load.mockReturnValue({
        name: 'Error Composite Action',
        runs: { 
          using: 'composite',
          steps: [{ run: 'echo "Step"', shell: 'bash' }]
        }
      });
      
      await expect(
        runActionWithWitness(actionDir, witnessOptions, witnessExePath, {})
      ).rejects.toThrow('Failed to run composite action');
    });
    
    test('should handle invalid composite action configuration', async () => {
      const actionDir = '/path/to/action';
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock action detection as composite
      getActionYamlPath.mockReturnValue('/path/to/action/action.yml');
      detectActionType.mockReturnValue('composite');
      
      // Return an invalid composite action config (missing steps)
      mockYaml.load.mockReturnValue({
        name: 'Invalid Composite Action',
        runs: { using: 'composite' }
      });
      
      // Expect error about missing steps
      await expect(
        runActionWithWitness(actionDir, witnessOptions, witnessExePath, {})
      ).rejects.toThrow('Invalid composite action configuration: missing steps');
    });
    
    test('should handle action yaml loading errors', async () => {
      const actionDir = '/path/to/action';
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock file not found
      mockFs.readFileSync.mockImplementationOnce(() => {
        throw new Error('ENOENT: file not found');
      });
      
      // Execute function and expect error
      await expect(
        runActionWithWitness(actionDir, witnessOptions, witnessExePath, {})
      ).rejects.toThrow('ENOENT: file not found');
      
      // Reset and mock yaml parsing error
      mockFs.readFileSync.mockReturnValue('mock action yaml content');
      mockYaml.load.mockImplementationOnce(() => {
        throw new Error('Invalid YAML');
      });
      
      await expect(
        runActionWithWitness(actionDir, witnessOptions, witnessExePath, {})
      ).rejects.toThrow('Invalid YAML');
    });
  });
});