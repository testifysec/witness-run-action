/**
 * Common test utilities for the witness-run-action project
 */
const path = require('path');
const mockCore = require('./mockCore');
const mockExec = require('./mockExec');
const mockFs = require('./mockFs');

/**
 * Sets up a common test environment with mocked dependencies
 */
function setupTestEnv() {
  // Reset all mocks
  mockCore.resetAllMocks();
  mockExec.resetAllMocks();
  mockFs.resetAllMocks();
  
  // Set up common environment variables for testing
  process.env.GITHUB_WORKSPACE = '/github/workspace';
  process.env.GITHUB_ACTION_PATH = '/github/action';
  process.env.GITHUB_OUTPUT = '/github/output';
  process.env.GITHUB_STEP_SUMMARY = '/github/step-summary';
  
  // Configure some default mock behaviors
  mockFs.mockFilesystem({
    '/github/workspace': {},
    '/github/action': {},
    '/github/output': 'mock content',
    '/github/step-summary': 'mock content',
    '/tmp': {}
  });
}

/**
 * Creates a mock action.yml file for testing
 */
function mockActionYaml(type, config = {}) {
  const actionDir = '/mock-action';
  const actionYmlPath = path.join(actionDir, 'action.yml');
  
  let actionConfig;
  
  // Create a base config for the requested action type
  switch (type) {
    case 'javascript':
      actionConfig = {
        name: 'Mock JavaScript Action',
        runs: {
          using: 'node20',
          main: 'index.js'
        }
      };
      break;
    case 'composite':
      actionConfig = {
        name: 'Mock Composite Action',
        runs: {
          using: 'composite',
          steps: [
            {
              name: 'Step 1',
              run: 'echo "Step 1"',
              shell: 'bash'
            }
          ]
        }
      };
      break;
    case 'docker':
      actionConfig = {
        name: 'Mock Docker Action',
        runs: {
          using: 'docker',
          image: 'Dockerfile'
        }
      };
      break;
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
  
  // Merge with the provided config
  const mergedConfig = { ...actionConfig, ...config };
  
  // Convert to YAML and store in the mock filesystem
  const yaml = require('js-yaml');
  const actionYaml = yaml.dump(mergedConfig);
  
  // Create directory and action.yml file
  mockFs.mockFilesystem({
    ...mockFs.fileSystem,
    [actionDir]: {},
    [actionYmlPath]: actionYaml
  });
  
  // If it's a JavaScript action, also create the index.js file
  if (type === 'javascript') {
    const indexJsPath = path.join(actionDir, 'index.js');
    mockFs.fileSystem.files[indexJsPath] = 'console.log("Mock JavaScript action")';
  }
  
  return {
    actionDir,
    actionYmlPath,
    actionConfig: mergedConfig
  };
}

/**
 * Creates default witness options for testing
 */
function getDefaultWitnessOptions() {
  return {
    step: 'test-step',
    archivistaServer: 'https://archivista.testifysec.io',
    attestations: ['environment', 'git', 'github'],
    certificate: '',
    enableArchivista: true,
    fulcio: '',
    fulcioOidcClientId: '',
    fulcioOidcIssuer: '',
    fulcioToken: '',
    intermediates: [],
    key: '',
    outfile: '/tmp/test-step-attestation.json',
    productExcludeGlob: '',
    productIncludeGlob: '',
    spiffeSocket: '',
    timestampServers: '',
    trace: false,
    enableSigstore: true,
    exportLink: false,
    exportSBOM: false,
    exportSLSA: false,
    mavenPOM: ''
  };
}

module.exports = {
  setupTestEnv,
  mockActionYaml,
  getDefaultWitnessOptions
};
