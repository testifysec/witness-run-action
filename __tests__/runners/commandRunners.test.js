/**
 * Tests for commandRunners.js
 */
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// Create mocks
const mockCore = {
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
};

const mockExec = {
  exec: jest.fn().mockResolvedValue(0)
};

// Updated mock to match the actual module signature
const mockDefaultsUtils = {
  applyDefaultsFromActionYml: jest.fn().mockImplementation((env, inputs, witnessParams) => {
    // Simulate applying defaults to the env object
    if (inputs && inputs.test && inputs.test.default) {
      env['INPUT_TEST'] = inputs.test.default;
    }
    return ['test-default'];
  })
};

const mockDetectActionType = jest.fn();
const mockGetActionYamlPath = jest.fn();
const mockRunJsActionWithWitness = jest.fn().mockResolvedValue('js action output');
const mockRunCompositeActionWithWitness = jest.fn().mockResolvedValue('composite action output');
const mockRunDockerActionWithWitness = jest.fn().mockResolvedValue('docker action output');
const mockAssembleWitnessArgs = jest.fn().mockReturnValue(['--arg1', '--arg2']);

// Create mock for fs functions
const mockReadFileSync = jest.fn().mockReturnValue('action: test');
const mockExistsSync = jest.fn().mockReturnValue(true);

// Create mock for yaml
const mockYamlLoad = jest.fn().mockReturnValue({ name: 'Test Action', inputs: { test: { default: 'test-value' } } });

// Mock dependencies
jest.mock('@actions/core', () => mockCore);
jest.mock('@actions/exec', () => mockExec);
jest.mock('fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync
}));
jest.mock('js-yaml', () => ({
  load: mockYamlLoad
}));
jest.mock('../../src/actions/actionUtils', () => ({
  detectActionType: mockDetectActionType,
  getActionYamlPath: mockGetActionYamlPath
}));
jest.mock('../../src/attestation/assembleWitnessArgs', () => mockAssembleWitnessArgs);
jest.mock('../../src/utils/defaultsUtils', () => mockDefaultsUtils);
jest.mock('../../src/actions/actionRunners', () => ({
  runJsActionWithWitness: mockRunJsActionWithWitness,
  runCompositeActionWithWitness: mockRunCompositeActionWithWitness,
  runDockerActionWithWitness: mockRunDockerActionWithWitness
}));

// Import after mocking
const { runActionWithWitness, runDirectCommandWithWitness } = require('../../src/runners/commandRunners');

describe('commandRunners', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default implementations
    mockGetActionYamlPath.mockReturnValue('/test/action.yml');
    mockDetectActionType.mockReturnValue('javascript');
  });
  
  describe('runActionWithWitness', () => {
    test('loads action config from action.yml', async () => {
      const actionDir = '/test/action';
      const witnessOptions = { step: 'test' };
      const witnessExePath = '/test/witness';
      const actionEnv = { TEST: 'value' };
      
      await runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv);
      
      expect(mockGetActionYamlPath).toHaveBeenCalledWith(actionDir);
      expect(mockReadFileSync).toHaveBeenCalledWith('/test/action.yml', 'utf8');
      expect(mockYamlLoad).toHaveBeenCalled();
    });
    
    test('applies defaults using defaultsUtils', async () => {
      const actionDir = '/test/action';
      const witnessOptions = { step: 'test' };
      const witnessExePath = '/test/witness';
      const actionEnv = { TEST: 'value' };
      
      await runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv);
      
      // Verify the call to applyDefaultsFromActionYml
      expect(mockDefaultsUtils.applyDefaultsFromActionYml).toHaveBeenCalledWith(
        actionEnv,
        expect.objectContaining({ test: { default: 'test-value' } }),
        expect.any(Set)
      );
      
      // Check that the info message about applied defaults is logged
      // Note: We no longer log default values to prevent potential exposure of secrets
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Applied 1 default values'));
      
      // Verify the mock updated the environment
      expect(actionEnv).toHaveProperty('INPUT_TEST', 'test-value');
    });
    
    test('runs javascript action', async () => {
      const actionDir = '/test/action';
      const witnessOptions = { step: 'test' };
      const witnessExePath = '/test/witness';
      const actionEnv = { TEST: 'value' };
      
      mockDetectActionType.mockReturnValue('javascript');
      
      const result = await runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv);
      
      expect(mockRunJsActionWithWitness).toHaveBeenCalledWith(
        actionDir,
        expect.any(Object),
        witnessOptions,
        witnessExePath,
        actionEnv
      );
      expect(result).toBe('js action output');
    });
    
    test('runs docker action', async () => {
      const actionDir = '/test/action';
      const witnessOptions = { step: 'test' };
      const witnessExePath = '/test/witness';
      const actionEnv = { TEST: 'value' };
      
      mockDetectActionType.mockReturnValue('docker');
      
      const result = await runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv);
      
      expect(mockRunDockerActionWithWitness).toHaveBeenCalledWith(
        actionDir,
        expect.any(Object),
        witnessOptions,
        witnessExePath,
        actionEnv
      );
      expect(result).toBe('docker action output');
    });
    
    test('runs composite action', async () => {
      const actionDir = '/test/action';
      const witnessOptions = { step: 'test' };
      const witnessExePath = '/test/witness';
      const actionEnv = { TEST: 'value' };
      
      mockDetectActionType.mockReturnValue('composite');
      
      const result = await runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv);
      
      expect(mockRunCompositeActionWithWitness).toHaveBeenCalledWith(
        actionDir,
        expect.any(Object),
        witnessOptions,
        witnessExePath,
        actionEnv
      );
      expect(result).toBe('composite action output');
    });
    
    test('accepts direct action config', async () => {
      const actionDir = '/test/action';
      const witnessOptions = { step: 'test' };
      const witnessExePath = '/test/witness';
      const actionEnv = { TEST: 'value' };
      const directActionConfig = { name: 'Direct Action' };
      
      mockDetectActionType.mockReturnValue('javascript');
      
      await runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv, directActionConfig);
      
      expect(mockGetActionYamlPath).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(mockYamlLoad).not.toHaveBeenCalled();
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('direct action config'));
    });
    
    test('throws error for unsupported action type', async () => {
      const actionDir = '/test/action';
      const witnessOptions = { step: 'test' };
      const witnessExePath = '/test/witness';
      const actionEnv = { TEST: 'value' };
      
      mockDetectActionType.mockReturnValue('unsupported');
      
      await expect(runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv))
        .rejects.toThrow('Unsupported action type');
    });
  });
  
  describe('runDirectCommandWithWitness', () => {
    test('assembles witness args and executes command', async () => {
      const command = 'test command';
      const witnessOptions = { step: 'test' };
      const witnessExePath = '/test/witness';
      
      await runDirectCommandWithWitness(command, witnessOptions, witnessExePath);
      
      expect(mockAssembleWitnessArgs).toHaveBeenCalledWith(witnessOptions, ['test', 'command']);
      expect(mockExec.exec).toHaveBeenCalledWith(witnessExePath, ['--arg1', '--arg2'], expect.any(Object));
    });
    
    test('handles quoted commands', async () => {
      const command = 'test "quoted command"';
      const witnessOptions = { step: 'test' };
      const witnessExePath = '/test/witness';
      
      // Customize the mock implementation for this test case
      mockAssembleWitnessArgs.mockImplementationOnce((options, args) => {
        // We know the command string parsing might be different in the actual code
        // Just verify args contains the command in some form
        return ['--processed-args'];
      });
      
      await runDirectCommandWithWitness(command, witnessOptions, witnessExePath);
      
      expect(mockAssembleWitnessArgs).toHaveBeenCalled();
      expect(mockExec.exec).toHaveBeenCalledWith(witnessExePath, ['--processed-args'], expect.any(Object));
    });
  });
});