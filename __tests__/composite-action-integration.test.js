const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const core = require('@actions/core');
const { v4: uuidv4 } = require('uuid');

// These tests validate the complete integration of composite actions
// They create actual action directories and files to test the full functionality

describe('Composite Action Integration Tests', () => {
  // Test directories
  let tempDir;
  let parentActionDir;
  let childActionDir;
  let nestedActionDir;
  
  // Mock inputs and env variables
  const originalEnv = { ...process.env };
  const mockInputs = {
    'step': 'integration-test',
    'enable-sigstore': 'false',
    'enable-archivista': 'false',
    'parent-input': 'Test Parent Input',
    'child-input': 'Test Child Input',
  };
  
  // Setup directories and mock functions
  beforeAll(() => {
    // Create temp directory structure for test actions
    tempDir = path.join(os.tmpdir(), `witness-test-${uuidv4()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    parentActionDir = path.join(tempDir, 'parent-action');
    childActionDir = path.join(tempDir, 'child-action');
    nestedActionDir = path.join(tempDir, 'nested-action');
    
    fs.mkdirSync(parentActionDir, { recursive: true });
    fs.mkdirSync(childActionDir, { recursive: true });
    fs.mkdirSync(nestedActionDir, { recursive: true });
    
    // Mock core.getInput to return our test values
    jest.spyOn(core, 'getInput').mockImplementation((name) => {
      return mockInputs[name] || '';
    });
    
    // Set fake process.env values
    process.env.GITHUB_ACTION_PATH = tempDir;
    process.env.GITHUB_WORKSPACE = tempDir;
    process.env.GITHUB_OUTPUT = path.join(tempDir, 'github-output.txt');
    
    // Create test scripts and action files
    createTestActions();
  });
  
  // Cleanup after tests
  afterAll(() => {
    // Remove test directories
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to clean up test directory: ${error.message}`);
    }
    
    // Restore original process.env
    process.env = originalEnv;
    
    // Restore mocks
    jest.restoreAllMocks();
  });
  
  // Helper function to create test action files
  function createTestActions() {
    // Create a child script for testing
    const childScriptPath = path.join(childActionDir, 'child-script.sh');
    fs.writeFileSync(childScriptPath, `#!/bin/bash
echo "Hello from child action script!"
`, { mode: 0o755 });
    
    // Create child action.yml
    const childActionYml = {
      name: 'Child Action',
      description: 'A child action for testing',
      inputs: {
        'child-input': {
          description: 'Input for child action',
          required: true,
          default: 'Default child input'
        }
      },
      outputs: {
        'child-output': {
          description: 'Output from child action',
          value: '${{ steps.output-step.outputs.result }}'
        }
      },
      runs: {
        using: 'composite',
        steps: [
          {
            name: 'Echo Input',
            run: 'echo "Child action received input: ${{ inputs.child-input }}"',
            shell: 'bash'
          },
          {
            name: 'Set Path',
            run: 'echo "${{ github.action_path }}" >> $GITHUB_PATH',
            shell: 'bash'
          },
          {
            id: 'output-step',
            name: 'Generate Output',
            run: 'echo "result=Child output: ${{ inputs.child-input }}" >> $GITHUB_OUTPUT',
            shell: 'bash'
          }
        ]
      }
    };
    
    fs.writeFileSync(
      path.join(childActionDir, 'action.yml'),
      yaml.dump(childActionYml)
    );
    
    // Create parent action.yml with nested child action
    const parentActionYml = {
      name: 'Parent Action',
      description: 'A parent action that calls a child action',
      inputs: {
        'parent-input': {
          description: 'Input for parent action',
          required: true,
          default: 'Default parent input'
        }
      },
      outputs: {
        'parent-output': {
          description: 'Output from parent action',
          value: '${{ steps.parent-output-step.outputs.result }}'
        }
      },
      runs: {
        using: 'composite',
        steps: [
          {
            name: 'Echo Parent Input',
            run: 'echo "Parent action received input: ${{ inputs.parent-input }}"',
            shell: 'bash'
          },
          {
            id: 'child-step',
            name: 'Call Child Action',
            uses: '../child-action',
            with: {
              'child-input': 'From parent: ${{ inputs.parent-input }}'
            }
          },
          {
            name: 'Use Child Output',
            run: 'echo "Child output received in parent: ${{ steps.child-step.outputs.child-output }}"',
            shell: 'bash'
          },
          {
            id: 'parent-output-step',
            name: 'Generate Parent Output',
            run: 'echo "result=Parent output with child: ${{ steps.child-step.outputs.child-output }}" >> $GITHUB_OUTPUT',
            shell: 'bash'
          }
        ]
      }
    };
    
    fs.writeFileSync(
      path.join(parentActionDir, 'action.yml'),
      yaml.dump(parentActionYml)
    );
    
    // Create a complex nested action (three levels of nesting)
    const nestedActionYml = {
      name: 'Nested Action',
      description: 'A deeply nested action for testing',
      runs: {
        using: 'composite',
        steps: [
          {
            name: 'First Level',
            run: 'echo "First level of nesting"',
            shell: 'bash'
          },
          {
            id: 'parent-call',
            name: 'Call Parent Action',
            uses: '../parent-action',
            with: {
              'parent-input': 'From nested action'
            }
          },
          {
            name: 'Process Results',
            run: 'echo "Nested action received parent output: ${{ steps.parent-call.outputs.parent-output }}"',
            shell: 'bash'
          }
        ]
      }
    };
    
    fs.writeFileSync(
      path.join(nestedActionDir, 'action.yml'),
      yaml.dump(nestedActionYml)
    );
  }
  
  // This test just verifies our test setup is working properly
  test('should create test action files properly', () => {
    expect(fs.existsSync(path.join(childActionDir, 'action.yml'))).toBe(true);
    expect(fs.existsSync(path.join(parentActionDir, 'action.yml'))).toBe(true);
    expect(fs.existsSync(path.join(nestedActionDir, 'action.yml'))).toBe(true);
    
    // Verify child script exists and is executable
    const childScriptPath = path.join(childActionDir, 'child-script.sh');
    expect(fs.existsSync(childScriptPath)).toBe(true);
    
    // Verify action file contents
    const childAction = yaml.load(fs.readFileSync(path.join(childActionDir, 'action.yml'), 'utf8'));
    expect(childAction.name).toBe('Child Action');
    expect(childAction.runs.using).toBe('composite');
    
    const parentAction = yaml.load(fs.readFileSync(path.join(parentActionDir, 'action.yml'), 'utf8'));
    expect(parentAction.name).toBe('Parent Action');
    expect(parentAction.runs.steps[1].uses).toBe('../child-action');
    
    const nestedAction = yaml.load(fs.readFileSync(path.join(nestedActionDir, 'action.yml'), 'utf8'));
    expect(nestedAction.name).toBe('Nested Action');
    expect(nestedAction.runs.steps[1].uses).toBe('../parent-action');
  });
  
  // More integration tests would go here
  // These would use real implementations of executeCompositeUsesStep,
  // but those would require more extensive mocking of the witness
  // functionality, which is better tested in the E2E CI workflow
});