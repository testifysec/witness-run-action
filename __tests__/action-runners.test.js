/**
 * Tests for actionRunners.js module
 */
const path = require('path');

// Import helpers
const mockCore = require('./helpers/mockCore');
const mockExec = require('./helpers/mockExec');

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Mock dependencies
jest.mock('@actions/core', () => mockCore);
jest.mock('@actions/exec', () => mockExec);

// Mock fs with a simpler approach
const mockFs = {
  existsSync: jest.fn()
};
jest.mock('fs', () => mockFs);

// Mock path with a simpler implementation
const mockPath = {
  join: jest.fn().mockImplementation((...args) => args.join('/')),
  sep: '/'
};
jest.mock('path', () => mockPath);

// Mock the compositeActionUtils module
const mockCompositeActionUtils = {
  executeCompositeShellStep: jest.fn().mockResolvedValue('Mock shell step output'),
  executeCompositeUsesStep: jest.fn().mockResolvedValue('Mock uses step output')
};
jest.mock('../src/actions/compositeActionUtils', () => mockCompositeActionUtils);

// Mock assembleWitnessArgs
const mockAssembleWitnessArgs = jest.fn().mockReturnValue(['--mock-witness-arg1', '--mock-witness-arg2']);
jest.mock('../src/attestation/assembleWitnessArgs', () => mockAssembleWitnessArgs);

// Now import the module to test
const { runJsActionWithWitness, runCompositeActionWithWitness } = require('../src/actions/actionRunners');

describe('Action Runners Tests', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    mockCore.resetAllMocks();
    mockExec.resetAllMocks();
    mockFs.existsSync.mockReset();
    mockPath.join.mockReset();
    mockCompositeActionUtils.executeCompositeShellStep.mockReset();
    mockCompositeActionUtils.executeCompositeUsesStep.mockReset();
    mockAssembleWitnessArgs.mockReset();
    
    // Set up common test environment
    process.env.GITHUB_WORKSPACE = '/mock-workspace';
    
    // Default mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockAssembleWitnessArgs.mockReturnValue(['--mock-witness-arg1', '--mock-witness-arg2']);
    mockExec.exec.mockResolvedValue(0);
  });

  describe('runJsActionWithWitness', () => {
    test('should run a JavaScript action successfully', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          main: 'index.js'
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = { INPUT_TEST: 'test-value' };
      
      // Mock file existence
      mockFs.existsSync.mockReturnValue(true);
      
      // Mock path.join for entry file
      mockPath.join.mockReturnValue('/mock-action-dir/index.js');
      
      // Call the function
      const result = await runJsActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath, 
        actionEnv
      );
      
      // Verify
      expect(mockPath.join).toHaveBeenCalledWith(actionDir, 'index.js');
      expect(mockAssembleWitnessArgs).toHaveBeenCalledWith(
        witnessOptions, 
        ["node", '/mock-action-dir/index.js']
      );
      expect(mockExec.exec).toHaveBeenCalledWith(
        witnessExePath,
        ['--mock-witness-arg1', '--mock-witness-arg2'],
        expect.objectContaining({
          cwd: actionDir,
          env: actionEnv
        })
      );
    });

    test('should throw an error if entry point is not defined', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = { runs: {} }; // Missing main entry point
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Call the function and expect an error
      await expect(runJsActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath
      )).rejects.toThrow('Entry point (runs.main) not defined in action metadata');
    });

    test('should throw an error if entry file does not exist', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          main: 'index.js'
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock file existence
      mockFs.existsSync.mockReturnValue(false);
      
      // Mock path.join for entry file
      mockPath.join.mockReturnValue('/mock-action-dir/index.js');
      
      // Call the function and expect an error
      await expect(runJsActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath
      )).rejects.toThrow('Entry file');
    });
  });

  describe('runCompositeActionWithWitness', () => {
    test('should run a composite action with multiple steps', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          steps: [
            {
              name: 'Step 1',
              run: 'echo "Hello"',
              shell: 'bash'
            },
            {
              name: 'Step 2',
              id: 'step2',
              uses: 'actions/setup-node@v3'
            }
          ]
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = { INPUT_TEST: 'test-value' };
      
      // Mock executeCompositeShellStep and executeCompositeUsesStep
      mockCompositeActionUtils.executeCompositeShellStep.mockResolvedValueOnce('Output from step 1');
      mockCompositeActionUtils.executeCompositeUsesStep.mockResolvedValueOnce('::set-output name=node-version::16.x');
      
      // Call the function
      const result = await runCompositeActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath, 
        actionEnv
      );
      
      // Verify step execution
      expect(mockCompositeActionUtils.executeCompositeShellStep).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Step 1',
          run: 'echo "Hello"',
          shell: 'bash'
        }),
        actionDir,
        witnessOptions,
        witnessExePath,
        expect.any(Object),
        actionConfig
      );
      
      expect(mockCompositeActionUtils.executeCompositeUsesStep).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Step 2',
          id: 'step2',
          uses: 'actions/setup-node@v3'
        }),
        actionDir,
        witnessOptions,
        witnessExePath,
        expect.any(Object),
        expect.any(Object)
      );
      
      // Verify output concatenation
      expect(result).toContain('Output from step 1');
      expect(result).toContain('::set-output name=node-version::16.x');
    });

    test('should throw an error for invalid steps array', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          // Missing steps array
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Call the function and expect an error
      await expect(runCompositeActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath
      )).rejects.toThrow('Invalid composite action: missing or invalid steps array');
    });

    test('should process inputs and handle defaults', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        inputs: {
          'provided-input': {
            required: true
          },
          'default-input': {
            default: 'default-value'
          },
          'optional-input': {
            required: false
          }
        },
        runs: {
          steps: [
            {
              name: 'Step 1',
              run: 'echo "Hello ${{ inputs.provided-input }} ${{ inputs.default-input }}"',
              shell: 'bash'
            }
          ]
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = { 
        INPUT_PROVIDED_INPUT: 'provided-value'
      };
      
      // Call the function
      await runCompositeActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath, 
        actionEnv
      );
      
      // Verify that executeCompositeShellStep was called with the processed environment
      expect(mockCompositeActionUtils.executeCompositeShellStep).toHaveBeenCalled();
      const calledWithEnv = mockCompositeActionUtils.executeCompositeShellStep.mock.calls[0][4];
      expect(calledWithEnv.INPUT_PROVIDED_INPUT).toBe('provided-value');
      expect(calledWithEnv.INPUT_DEFAULT_INPUT).toBe('default-value');
    });

    test('should throw an error for missing required inputs', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        inputs: {
          'required-input': {
            required: true
          }
        },
        runs: {
          steps: [
            {
              name: 'Step 1',
              run: 'echo "Hello"',
              shell: 'bash'
            }
          ]
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = {}; // Missing required input
      
      // Call the function and expect an error
      await expect(runCompositeActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath, 
        actionEnv
      )).rejects.toThrow('Required input \'required-input\' was not provided');
    });

    test('should handle step execution errors', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          steps: [
            {
              name: 'Failing Step',
              run: 'echo "Hello"',
              shell: 'bash'
            }
          ]
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock executeCompositeShellStep to throw an error
      mockCompositeActionUtils.executeCompositeShellStep.mockRejectedValueOnce(new Error('Step execution failed'));
      
      // Call the function and expect an error
      await expect(runCompositeActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath
      )).rejects.toThrow('Error executing step 1: Step execution failed');
    });

    test('should handle unsupported step types', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          steps: [
            {
              name: 'Unsupported Step',
              // No run or uses property
            }
          ]
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Call the function
      const result = await runCompositeActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath
      );
      
      // Verify
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Skipping unsupported step type'));
      expect(mockCompositeActionUtils.executeCompositeShellStep).not.toHaveBeenCalled();
      expect(mockCompositeActionUtils.executeCompositeUsesStep).not.toHaveBeenCalled();
    });
  });
});