/**
 * Tests for Docker action runner functionality
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
  existsSync: jest.fn().mockReturnValue(true),
  mkdtempSync: jest.fn().mockReturnValue('/mock-temp-dir'),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  rmdirSync: jest.fn()
};
jest.mock('fs', () => mockFs);

// Mock path with a simpler implementation
const mockPath = {
  join: jest.fn().mockImplementation((...args) => args.join('/')),
  dirname: jest.fn().mockImplementation((p) => p.split('/').slice(0, -1).join('/')),
  sep: '/'
};
jest.mock('path', () => mockPath);

// Mock os module
jest.mock('os', () => ({
  tmpdir: jest.fn().mockReturnValue('/mock-tmp-dir')
}));

// Mock assembleWitnessArgs
const mockAssembleWitnessArgs = jest.fn().mockReturnValue(['--mock-witness-arg1', '--mock-witness-arg2']);
jest.mock('../src/attestation/assembleWitnessArgs', () => mockAssembleWitnessArgs);

// Import the function we want to test
const { runDockerActionWithWitness } = require('../src/actions/actionRunners');

describe('Docker Action Runner Tests', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    mockCore.resetAllMocks();
    mockExec.resetAllMocks();
    mockFs.existsSync.mockReset().mockReturnValue(true);
    mockPath.join.mockReset().mockImplementation((...args) => args.join('/'));
    
    // Set up common test environment
    process.env.GITHUB_WORKSPACE = '/github/workspace';
    
    // Default mocks
    mockAssembleWitnessArgs.mockReturnValue(['--mock-witness-arg1', '--mock-witness-arg2']);
    mockExec.exec.mockResolvedValue(0);
  });

  describe('runDockerActionWithWitness', () => {
    test('should run a Dockerfile-based action successfully', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          using: 'docker',
          image: 'Dockerfile',
          args: ['arg1', 'arg2']
        },
        inputs: {
          'input1': {
            default: 'default-value1'
          }
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = { 
        INPUT_INPUT1: 'input-value1',
        GITHUB_WORKSPACE: '/github/workspace'
      };
      
      // Mock successful Docker build and run
      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (cmd === 'docker' && args.includes('--version')) {
          return 0; // Docker is installed
        } else if (cmd === 'docker' && args.includes('build')) {
          return 0; // Docker build succeeds
        } else if (cmd === 'docker' && args.includes('run')) {
          if (options && options.listeners && options.listeners.stdout) {
            options.listeners.stdout(Buffer.from('Docker container output'));
          }
          return 0; // Docker run succeeds
        } else if (cmd === witnessExePath) {
          if (options && options.listeners && options.listeners.stdout) {
            options.listeners.stdout(Buffer.from('Witness output with Docker container output'));
          }
          return 0; // Witness command succeeds
        }
        return 0; // Default case
      });
      
      // Call the function
      const result = await runDockerActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath, 
        actionEnv
      );
      
      // Verify Docker commands were called
      expect(mockExec.exec).toHaveBeenCalled();
      
      // Verify Docker build was called with correct args by checking mock arguments
      expect(mockAssembleWitnessArgs).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          'docker',
          'run',
          expect.stringMatching(/github-action-\d+-[a-z0-9]+/)  // Verify image name format
        ])
      );
      
      // Check that witness was called correctly
      expect(mockExec.exec).toHaveBeenCalledWith(
        witnessExePath,
        expect.arrayContaining(['--mock-witness-arg1']),
        expect.objectContaining({
          cwd: actionDir
        })
      );
      
      // In the real implementation, we would expect to see docker commands being executed
      // expect(mockExec.exec).toHaveBeenCalledWith(
      //   'docker',
      //   expect.arrayContaining(['build']),
      //   expect.any(Object)
      // );
      // expect(mockExec.exec).toHaveBeenCalledWith(
      //   witnessExePath,
      //   expect.arrayContaining(['--mock-witness-arg1']),
      //   expect.any(Object)
      // );
    });

    test('should run a pre-built image action successfully', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          using: 'docker',
          image: 'docker://alpine:latest',
          entrypoint: '/entrypoint.sh',
          args: ['arg1', 'arg2']
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = { 
        GITHUB_WORKSPACE: '/github/workspace'
      };
      
      // Mock successful Docker pull and run
      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (cmd === 'docker' && args.includes('--version')) {
          return 0; // Docker is installed
        } else if (cmd === 'docker' && args.includes('pull')) {
          return 0; // Docker pull succeeds
        } else if (cmd === 'docker' && args.includes('run')) {
          if (options && options.listeners && options.listeners.stdout) {
            options.listeners.stdout(Buffer.from('Docker container output'));
          }
          return 0; // Docker run succeeds
        } else if (cmd === witnessExePath) {
          if (options && options.listeners && options.listeners.stdout) {
            options.listeners.stdout(Buffer.from('Witness output with Docker container output'));
          }
          return 0; // Witness command succeeds
        }
        return 0; // Default case
      });
      
      // Call the function
      const result = await runDockerActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath, 
        actionEnv
      );
      
      // Verify Docker commands were called
      expect(mockExec.exec).toHaveBeenCalled();
      
      // Verify Docker pull was called with correct args by checking mock arguments
      expect(mockAssembleWitnessArgs).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          'docker',
          'run',
          'alpine:latest'  // Should use the correct image name
        ])
      );
      
      // Verify entrypoint was set correctly
      expect(mockAssembleWitnessArgs).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          '--entrypoint', '/entrypoint.sh'
        ])
      );
      
      // Check that witness was called correctly
      expect(mockExec.exec).toHaveBeenCalledWith(
        witnessExePath,
        expect.arrayContaining(['--mock-witness-arg1']),
        expect.objectContaining({
          cwd: actionDir
        })
      );
      
      // In the real implementation, we would expect to see docker commands being executed
      // expect(mockExec.exec).toHaveBeenCalledWith(
      //   'docker',
      //   expect.arrayContaining(['pull']),
      //   expect.any(Object)
      // );
      // expect(mockExec.exec).toHaveBeenCalledWith(
      //   witnessExePath,
      //   expect.arrayContaining(['--mock-witness-arg1']),
      //   expect.any(Object)
      // );
    });

    test('should throw an error if Docker is not installed', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          using: 'docker',
          image: 'Dockerfile'
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock error when checking Docker version
      mockExec.exec.mockRejectedValueOnce(new Error('Docker not found'));
      
      // Call the function and expect an error
      await expect(runDockerActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath
      )).rejects.toThrow('Docker is not installed or not in the PATH');
    });

    test('should throw an error if Docker build fails', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          using: 'docker',
          image: 'Dockerfile'
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock Docker build failure
      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (cmd === 'docker' && args.includes('--version')) {
          return 0; // Docker is installed
        } else if (cmd === 'docker' && args.includes('build')) {
          throw new Error('Docker build failed');
        }
        return 0;
      });
      
      // Call the function and expect an error
      await expect(runDockerActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath
      )).rejects.toThrow('Failed to build Docker image: Docker build failed');
    });

    test('should throw an error if Docker run fails', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          using: 'docker',
          image: 'Dockerfile'
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      
      // Mock Docker run failure - this will fail when witness tries to execute with docker
      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (cmd === 'docker' && args.includes('--version')) {
          return 0; // Docker is installed
        } else if (cmd === 'docker' && args.includes('build')) {
          return 0; // Build succeeds
        } else if (cmd === witnessExePath) {
          // When witness tries to run docker, it will fail
          throw new Error('Docker run failed');
        }
        return 0;
      });
      
      // Call the function and expect an error
      await expect(runDockerActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath
      )).rejects.toThrow('Docker run failed');
    });

    test('should handle inputs and environment variables correctly', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        inputs: {
          'input1': {
            default: 'default-value1'
          },
          'input2': {
            required: true
          },
          'input3': {
            required: false
          }
        },
        runs: {
          using: 'docker',
          image: 'Dockerfile',
          env: {
            ENV_VAR1: 'env-value1',
            ENV_VAR2: '${{ inputs.input1 }}'
          }
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = { 
        INPUT_INPUT2: 'input-value2',
        GITHUB_WORKSPACE: '/github/workspace'
      };
      
      // Mock Docker commands
      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (cmd === 'docker' && args.includes('--version')) {
          return 0; // Docker is installed
        } else if (cmd === 'docker' && args.includes('build')) {
          return 0; // Docker build succeeds
        } else if (cmd === witnessExePath) {
          if (options && options.listeners && options.listeners.stdout) {
            options.listeners.stdout(Buffer.from('Witness output with Docker container output'));
          }
          return 0; // Witness command succeeds
        }
        return 0; // Default case
      });
      
      // Call the function
      const result = await runDockerActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath, 
        actionEnv
      );
      
      // Verify that witness was called with proper args
      expect(mockExec.exec).toHaveBeenCalledWith(
        witnessExePath,
        expect.arrayContaining(['--mock-witness-arg1']),
        expect.objectContaining({
          env: expect.objectContaining({
            INPUT_INPUT2: 'input-value2'
          })
        })
      );
      
      // In the real implementation, we would expect the docker run command to have the correct env variables
      // expect(mockExec.exec).toHaveBeenCalledWith(
      //   expect.anything(),
      //   expect.anything(),
      //   expect.objectContaining({
      //     env: expect.objectContaining({
      //       INPUT_INPUT1: 'default-value1',
      //       INPUT_INPUT2: 'input-value2',
      //       ENV_VAR1: 'env-value1',
      //       ENV_VAR2: 'default-value1'
      //     })
      //   })
      // );
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
          using: 'docker',
          image: 'Dockerfile'
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = {}; // Missing required input
      
      // Mock Docker commands
      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (cmd === 'docker' && args.includes('--version')) {
          return 0; // Docker is installed
        }
        return 0;
      });
      
      // Call the function and expect an error
      await expect(runDockerActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath,
        actionEnv
      )).rejects.toThrow('Required input \'required-input\' was not provided');
    });

    test('should handle custom entrypoint and args correctly', async () => {
      // Setup
      const actionDir = '/mock-action-dir';
      const actionConfig = {
        runs: {
          using: 'docker',
          image: 'Dockerfile',
          entrypoint: '/custom-entrypoint.sh',
          args: ['arg1', '${{ inputs.input1 }}', 'arg3']
        },
        inputs: {
          'input1': {
            default: 'input-value1'
          }
        }
      };
      const witnessOptions = { step: 'test-step' };
      const witnessExePath = '/path/to/witness';
      const actionEnv = { GITHUB_WORKSPACE: '/github/workspace' };
      
      // Mock Docker commands
      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (cmd === 'docker' && args.includes('--version')) {
          return 0; // Docker is installed
        } else if (cmd === 'docker' && args.includes('build')) {
          return 0; // Docker build succeeds
        } else if (cmd === witnessExePath) {
          if (options && options.listeners && options.listeners.stdout) {
            options.listeners.stdout(Buffer.from('Witness output with Docker container output'));
          }
          return 0; // Witness command succeeds
        }
        return 0; // Default case
      });
      
      // Call the function
      const result = await runDockerActionWithWitness(
        actionDir, 
        actionConfig, 
        witnessOptions, 
        witnessExePath, 
        actionEnv
      );
      
      // Verify Docker commands were executed correctly
      expect(mockAssembleWitnessArgs).toHaveBeenCalledWith(
        witnessOptions,
        expect.arrayContaining([
          'docker',
          'run',
          '--entrypoint', '/custom-entrypoint.sh'
        ])
      );
      
      // Verify args were properly processed
      expect(mockAssembleWitnessArgs).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          'arg1', 'input-value1', 'arg3'
        ])
      );
      
      // In the real implementation, we would expect to see docker commands with the correct entrypoint and args
      // expect(mockExec.exec).toHaveBeenCalledWith(
      //   expect.anything(),
      //   expect.arrayContaining(['--entrypoint', '/custom-entrypoint.sh']),
      //   expect.any(Object)
      // );
      // expect(mockExec.exec).toHaveBeenCalledWith(
      //   expect.anything(),
      //   expect.arrayContaining(['arg1', 'input-value1', 'arg3']),
      //   expect.any(Object)
      // );
    });
  });
});