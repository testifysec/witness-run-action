/**
 * Main action runner class for witness-run-action
 */
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

const { downloadAndSetupWitness } = require('../core/witnessDownloader');
const getWitnessOptions = require('../attestation/getWitnessOptions');
const { runActionWithWitness, runDirectCommandWithWitness } = require('./commandRunners');
const { handleGitOIDs } = require('../attestation/gitOidUtils');
const { downloadAndSetupAction, cleanUpDirectory } = require('../actions/actionSetup');

/**
 * Main action runner class
 * Handles the overall flow for the witness-run-action
 */
class WitnessActionRunner {
  constructor() {
    // Will be initialized during run
    this.witnessExePath = null;
    this.witnessOptions = null;
    this.actionDir = null;
  }
  
  /**
   * Sets up witness and prepares options
   */
  async setup() {
    try {
      // Download and set up witness binary
      this.witnessExePath = await downloadAndSetupWitness();
      core.info(`Witness executable path: ${this.witnessExePath}`);
      
      // Build witness options from inputs
      this.witnessOptions = getWitnessOptions();
      
      // Ensure we run in the GitHub workspace
      process.chdir(process.env.GITHUB_WORKSPACE || process.cwd());
      core.info(`Running in directory ${process.cwd()}`);
      
      return true;
    } catch (error) {
      core.setFailed(`Failed to set up Witness: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Main run method that orchestrates the action execution
   */
  async run() {
    try {
      // Set up witness
      const setupSuccess = await this.setup();
      if (!setupSuccess) {
        return;
      }
      
      // Get input parameters
      const command = core.getInput("command");
      const actionRef = core.getInput("action-ref");
      
      if (!command && !actionRef) {
        core.setFailed("Invalid input: Either 'command' or 'action-ref' input is required");
        process.exit(1);
      }
      
      // Allow both command and action-ref when using Docker image reference
      if (command && actionRef && !actionRef.startsWith('docker://')) {
        core.setFailed("Invalid input: Either 'command' or 'action-ref' input is required, but not both unless using Docker image reference");
        process.exit(1);
      }
      
      let output = "";
      
      // Run the appropriate action or command
      if (actionRef) {
        output = await this.executeAction(actionRef);
      } else if (command) {
        output = await this.executeCommand(command);
      }
      
      // Process GitOIDs from output
      handleGitOIDs(
        output, 
        this.witnessOptions.archivistaServer, 
        this.witnessOptions.step, 
        this.witnessOptions.attestations
      );
      
      core.info('Witness run completed successfully');
    } catch (error) {
      core.setFailed(`Witness run action failed: ${error.message}`);
      process.exit(1);
    }
  }
  
  /**
   * Executes the specified GitHub Action with Witness
   */
  async executeAction(actionRef) {
    core.info(`Wrapping GitHub Action: ${actionRef}`);
    
    // Check if this is a direct Docker image reference
    if (actionRef.startsWith('docker://')) {
      core.info(`Executing Docker action for direct image reference: ${actionRef}`);
      
      // Create a minimal action config for the Docker image
      const command = core.getInput('command');
      
      // Create a synthetic action config for Docker
      const actionConfig = {
        name: 'Docker Image Action',
        description: 'Docker container action',
        runs: {
          using: 'docker',
          image: actionRef, // Keep the docker:// prefix for proper handling
          args: command ? ['/bin/sh', '-c', command] : []
        }
      };
      
      // Use the workspace directory for running the Docker action
      const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();
      
      // Get custom inputs to pass to Docker
      const actionEnv = this.getWrappedActionEnv(workspaceDir);
      
      // Run as a Docker action with witness
      core.info(`Running direct Docker image as a Docker action: ${actionRef}`);
      return await runActionWithWitness(
        workspaceDir,
        this.witnessOptions,
        this.witnessExePath,
        actionEnv,
        actionConfig  // Pass the synthetic action config directly
      );
    }
    
    // Determine action directory - local or remote
    if (actionRef.startsWith('./') || actionRef.startsWith('../')) {
      this.actionDir = this.resolveLocalActionPath(actionRef);
    } else {
      // Download remote action
      core.info(`Downloading remote action: ${actionRef}`);
      this.actionDir = await downloadAndSetupAction(actionRef);
      core.info(`Downloaded action to: ${this.actionDir}`);
    }
    
    // Prepare environment for the wrapped action
    const actionEnv = this.getWrappedActionEnv(this.actionDir);
    
    try {
      // Run the action with witness
      return await runActionWithWitness(
        this.actionDir,
        this.witnessOptions,
        this.witnessExePath,
        actionEnv
      );
    } finally {
      // Only clean up if it was a remote downloaded action
      if (this.actionDir && !actionRef.startsWith('./') && !actionRef.startsWith('../')) {
        cleanUpDirectory(this.actionDir);
      }
    }
  }
  
  /**
   * Executes a direct command with Witness
   */
  async executeCommand(command) {
    core.info(`Running command: ${command}`);
    return await runDirectCommandWithWitness(
      command,
      this.witnessOptions,
      this.witnessExePath
    );
  }
  
  /**
   * Resolves a local action reference path
   */
  resolveLocalActionPath(actionRef) {
    // Validate action reference doesn't contain potentially dangerous path components
    if (actionRef.includes('\\') || actionRef.includes('//')) {
      throw new Error(`Invalid action reference path: ${actionRef} contains unsafe path components`);
    }
    
    core.info(`Using local action reference: ${actionRef}`);
    
    const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();
    
    // Try with and without leading ./
    const pathWithoutDot = actionRef.replace(/^\.\//, '');
    core.info(`Trying to resolve path without leading ./: ${pathWithoutDot}`);
    
    const actionDirPath = path.resolve(workspaceDir, pathWithoutDot);
    
    // Validate the resolved path doesn't escape outside the repository root
    if (!actionDirPath.startsWith(workspaceDir)) {
      throw new Error(`Security error: Action path would resolve outside the repository: ${actionDirPath}`);
    }
    
    const hasActionYml = fs.existsSync(path.join(actionDirPath, 'action.yml'));
    const hasActionYaml = fs.existsSync(path.join(actionDirPath, 'action.yaml'));
    
    core.info(`action.yml exists: ${hasActionYml}`);
    core.info(`action.yaml exists: ${hasActionYaml}`);
    
    if (hasActionYml || hasActionYaml) {
      return actionDirPath;
    }
        
    throw new Error(`Could not find action at ${actionRef} (looking in ${actionDirPath})`);
  }
  
  /**
   * Prepares the environment variables to be passed to a wrapped action.
   * Applies defaults from action.yml and normalizes boolean values.
   * 
   * @param {string} actionDir - Directory containing the wrapped action
   * @returns {Object} Environment variables for the wrapped action
   */
  getWrappedActionEnv(actionDir) {
    const fs = require('fs');
    const yaml = require('js-yaml');
    const { getActionYamlPath } = require('../actions/actionUtils');
    const { getEnvKey } = require('../utils/envUtils');
    const { applyDefaultsFromActionYml, checkRequiredInput } = require('../utils/defaultsUtils');
    
    // Start with a copy of the current environment
    const newEnv = { ...process.env };
    
    // Define witness-specific parameters to filter out
    const witnessParams = new Set([
      'step', 'witness_version', 'action-ref',
      'archivista-server', 'attestations', 'command'
    ]);
    
    // Track processed inputs for logging
    const passedInputs = [];
    
    // Process input- prefixed variables first
    // This is crucial for correct boolean parameter handling
    for (const key in process.env) {
      if (key.startsWith('INPUT_')) {
        const inputNameRaw = key.substring(6).toLowerCase();
        const inputValue = process.env[key];
        
        // Skip witness parameters
        if (witnessParams.has(inputNameRaw)) continue;
        
        // Handle input- prefixed inputs by stripping the prefix
        // NOTE: GitHub Actions converts "input-debug" in YAML to "INPUT_INPUT-DEBUG" in env
        if (inputNameRaw.startsWith('input-')) {
          const originalName = inputNameRaw;
          const strippedName = inputNameRaw.substring(6); // Remove 'input-' prefix
          
          // Use our utility function to get correct environment variable key
          const newKey = getEnvKey(strippedName);
          
          // IMPORTANT: Preserve the original value exactly as-is
          // This ensures boolean values keep their original format
          // which is essential for YAML 1.2 Core Schema compliance
          
          // Set the new environment variable and remove the old one
          newEnv[newKey] = inputValue;
          delete newEnv[key];
          
          core.info(`Mapped input-prefixed parameter: ${originalName} -> ${strippedName} (env: ${newKey})`);
          
          // Track this as a passed input if not already in the list
          if (!passedInputs.includes(strippedName)) {
            passedInputs.push(strippedName);
          }
        }
      }
    }
    
    // Process action.yml to get defaults if directory is provided
    if (actionDir) {
      try {
        // Get the action.yml path and read it
        const actionYmlPath = getActionYamlPath(actionDir);
        const actionYmlContent = fs.readFileSync(actionYmlPath, 'utf8');
        const actionConfig = yaml.load(actionYmlContent);
        
        // Process each input from the action config using our centralized utility
        if (actionConfig && actionConfig.inputs) {
          const appliedDefaults = applyDefaultsFromActionYml(newEnv, actionConfig.inputs, witnessParams);
          
          if (appliedDefaults.length > 0) {
            core.info(`Applied default values for inputs: ${appliedDefaults.join(', ')}`);
            
            // Add applied defaults to our tracking list
            for (const inputName of appliedDefaults) {
              if (!passedInputs.includes(inputName)) {
                passedInputs.push(inputName);
              }
            }
          }
          
          // Check for missing required inputs
          for (const [inputName, inputConfig] of Object.entries(actionConfig.inputs)) {
            if (witnessParams.has(inputName)) continue;
            
            if (inputConfig.required === true) {
              checkRequiredInput(newEnv, inputName);
            }
          }
        }
      } catch (error) {
        core.warning(`Error processing action.yml: ${error.message}`);
      }
    }
    
    // Process non-prefixed inputs for tracking/logging purposes
    Object.keys(newEnv)
      .filter(key => key.startsWith('INPUT_'))
      .forEach(key => {
        // Extract the original input name, converting back from env format
        const inputName = key.substring(6).toLowerCase().replace(/_/g, '-');
        
        // Skip witness parameters
        if (witnessParams.has(inputName)) return;
        
        // Add to passed inputs if not already included
        if (!passedInputs.includes(inputName)) {
          passedInputs.push(inputName);
        }
      });
    
    // Log inputs being passed
    core.info(`Passing direct input to wrapped action: ${passedInputs.length} inputs`);
    
    return newEnv;
  }
}

module.exports = WitnessActionRunner;