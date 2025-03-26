/**
 * Command execution functionality for running actions and commands with Witness
 */
const core = require("@actions/core");
const exec = require("@actions/exec");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const assembleWitnessArgs = require("../attestation/assembleWitnessArgs");
const { detectActionType } = require("../actions/actionUtils");
const { getActionYamlPath } = require("../actions/actionUtils");
const { applyDefaultsFromActionYml } = require("../utils/defaultsUtils");

/**
 * Gets the set of witness-specific parameters to filter out
 * @returns {Set<string>} Set of parameter names to filter out
 */
function getWitnessParameters() {
  const witnessParams = new Set();
  
  try {
    // In a test environment, use a minimal set
    if (process.env.NODE_ENV === 'test') {
      const testParams = [
        'step', 'witness_version', 'action-ref',
        'archivista-server', 'attestations', 'command', 'version',
        'enable-sigstore', 'enable-archivista'
      ];
      testParams.forEach(param => witnessParams.add(param));
      return witnessParams;
    }
    
    // In production, read from our own action.yml
    const ourActionYamlPath = path.resolve(__dirname, '../../action.yml');
    const ourActionYml = yaml.load(fs.readFileSync(ourActionYamlPath, 'utf8'));
    
    if (ourActionYml && ourActionYml.inputs) {
      // Add all our action's inputs as parameters to filter out
      Object.keys(ourActionYml.inputs).forEach(inputName => {
        // Skip the wildcard entry
        if (inputName !== '*') {
          witnessParams.add(inputName.toLowerCase());
        }
      });
    }
    core.debug(`Loaded ${witnessParams.size} Witness parameters to filter from action.yml defaults`);
  } catch (error) {
    // Fallback to a minimal set if we can't read our action.yml
    const fallbackParams = [
      'step', 'witness_version', 'action-ref',
      'archivista-server', 'attestations', 'command', 'version',
      'enable-sigstore', 'enable-archivista'
    ];
    fallbackParams.forEach(param => witnessParams.add(param));
    core.warning(`Failed to load Witness parameters from action.yml: ${error.message}. Using minimal set.`);
  }
  
  return witnessParams;
}
const {
  runJsActionWithWitness,
  runCompositeActionWithWitness,
  runDockerActionWithWitness
} = require("../actions/actionRunners");

/**
 * Runs a wrapped GitHub Action using witness.
 * It reads the action's metadata, determines the type, and executes it with the appropriate handler.
 * Optionally accepts a direct actionConfig parameter for cases like direct Docker containers.
 */
async function runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv, directActionConfig = null) {
  // Use provided action config or load from file
  let actionConfig = directActionConfig;
  
  if (!actionConfig) {
    const actionYmlPath = getActionYamlPath(actionDir);
    actionConfig = yaml.load(fs.readFileSync(actionYmlPath, 'utf8'));
    // Log basic action info without exposing configuration details
    core.info(`Loaded action: ${actionConfig.name || 'Unnamed Action'} with ${actionConfig.inputs ? Object.keys(actionConfig.inputs).length : 0} inputs`);

    // Apply default values from action.yml
    const witnessParams = getWitnessParameters();
    
    // Use our centralized utility to apply defaults
    const appliedDefaults = applyDefaultsFromActionYml(actionEnv, actionConfig.inputs, witnessParams);
    
    if (appliedDefaults.length > 0) {
      core.info(`Applied ${appliedDefaults.length} default values from action.yml`);
      // Don't log the actual default values to avoid exposing potential secrets
    }
    

    core.info(`Loaded action config from ${actionYmlPath}`);
  } else {
    core.info(`Using provided direct action config`);
  }
  
  const actionType = detectActionType(actionConfig);
  core.info(`Detected action type: ${actionType}`);
  
  switch (actionType) {
    case 'javascript':
      return await runJsActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv);
    case 'docker':
      return await runDockerActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv);
    case 'composite':
      return await runCompositeActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv);
    default:
      throw new Error(`Unsupported action type: ${actionType}`);
  }
}

/**
 * Runs a direct command using witness.
 */
async function runDirectCommandWithWitness(command, witnessOptions, witnessExePath) {
  const commandArray = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [command];
  const args = assembleWitnessArgs(witnessOptions, commandArray);
  // Command details not logged to protect secrets

  let output = "";
  await exec.exec(witnessExePath, args, {
    cwd: process.env.GITHUB_WORKSPACE || process.cwd(),
    env: process.env,
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
      stderr: (data) => {
        const str = data.toString();
        output += str;
        
        // Process Witness stderr output, only warning on actual errors
        if (str.trim()) {
          const line = str.trim();
          // Filter out common expected errors that happen during tests or when optional credentials aren't provided
          const isExpectedError = 
            line.includes('failed to create kms signer: no kms provider found for key reference') ||
            line.includes('failed to create vault signer: url is a required option') ||
            line.includes('Unexpected input') ||
            // Add other patterns to ignore here
            false;

          if ((line.includes('level=error') || line.includes('level=fatal') || line.includes('level=warning')) 
              && !isExpectedError) {
            core.warning(`Witness stderr: ${line}`);
          } else {
            // Just info or debug messages, use core.debug
            core.debug(`Witness stderr: ${line}`);
          }
        }
      },
    },
  });
  
  return output;
}

module.exports = {
  runActionWithWitness,
  runDirectCommandWithWitness
};