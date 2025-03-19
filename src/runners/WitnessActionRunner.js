/**
 * Main action runner class for witness-run-action
 */
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

const { downloadAndSetupWitness } = require('../core/witnessDownloader');
const getWitnessOptions = require('../attestation/getWitnessOptions');
const { runActionWithWitness, runDirectCommandWithWitness } = require('./commandRunners');
const { extractDesiredGitOIDs, handleGitOIDs } = require('../attestation/gitOidUtils');
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
        throw new Error("Either 'command' or 'action-ref' input is required");
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
      
      // Get custom inputs to pass to Docker
      const actionEnv = this.getWrappedActionEnv();
      
      // Use the workspace directory for running the Docker action
      const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();
      
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
    const actionEnv = this.getWrappedActionEnv();
    
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
    
    // Log working directory for debugging
    core.info(`Current working directory: ${process.cwd()}`);
    core.info(`GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE || 'not set'}`);
    
    const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();
    
    // Try with and without leading ./
    const pathWithoutDot = actionRef.replace(/^\.\//, '');
    core.info(`Trying to resolve path without leading ./: ${pathWithoutDot}`);
    
    const actionDirPath = path.resolve(workspaceDir, pathWithoutDot);
    
    // Validate the resolved path doesn't escape outside the repository root
    if (!actionDirPath.startsWith(workspaceDir)) {
      throw new Error(`Security error: Action path would resolve outside the repository: ${actionDirPath}`);
    }
    
    core.info(`Fully resolved action path: ${actionDirPath}`);
    
    const hasActionYml = fs.existsSync(path.join(actionDirPath, 'action.yml'));
    const hasActionYaml = fs.existsSync(path.join(actionDirPath, 'action.yaml'));
    
    core.info(`action.yml exists: ${hasActionYml}`);
    core.info(`action.yaml exists: ${hasActionYaml}`);
    
    if (hasActionYml || hasActionYaml) {
      return actionDirPath;
    }
    
    // If we couldn't find it, let's list directories to help debug
    core.info(`Failed to locate action. Directory listings for debugging:`);
    
    try {
      // List the expected parent directory
      const parentDir = path.dirname(actionDirPath);
      if (fs.existsSync(parentDir)) {
        core.info(`Contents of ${parentDir}:`);
        core.info(JSON.stringify(fs.readdirSync(parentDir)));
      } else {
        core.info(`Parent directory ${parentDir} does not exist`);
      }
      
      // List the workspace root
      core.info(`Contents of workspace ${workspaceDir}:`);
      core.info(JSON.stringify(fs.readdirSync(workspaceDir)));
      
      // Check if .github/actions exists and list it
      const githubActionsDir = path.join(workspaceDir, '.github', 'actions');
      if (fs.existsSync(githubActionsDir)) {
        core.info(`Contents of ${githubActionsDir}:`);
        core.info(JSON.stringify(fs.readdirSync(githubActionsDir)));
      }
    } catch (error) {
      core.info(`Error listing directories: ${error.message}`);
    }
    
    throw new Error(`Could not find action at ${actionRef} (looking in ${actionDirPath})`);
  }
  
  /**
   * Prepares the environment variables to be passed to a wrapped action.
   * All direct inputs are passed as "passed inputs".
   */
  getWrappedActionEnv() {
    // Start with a copy of the current environment
    const newEnv = { ...process.env };
    const passedInputs = new Set();
    
    // Debug: Log existing environment variables that might be relevant
    core.info('Debug: Environment variables in getWrappedActionEnv:');
    ['GITHUB_TOKEN', 'INPUT_GITHUB_TOKEN', 'INPUT_GITHUB-TOKEN', 'INPUT_TOKEN'].forEach(key => {
      if (process.env[key]) {
        core.info(`  ${key} is defined`);
      }
    });
    
    // Pass through ALL environment variables, including inputs
    // This avoids any filtering and ensures Docker containers get all the inputs they need
    
    // Log all inputs for debugging purposes
    const allInputs = [];
    for (const key in process.env) {
      if (key.startsWith('INPUT_')) {
        const inputName = key.substring(6).toLowerCase();
        if (!passedInputs.has(inputName)) {
          allInputs.push(`${inputName}=${process.env[key]}`);
          passedInputs.add(inputName);
        }
      }
    }
    
    if (allInputs.length > 0) {
      core.info(`Passing direct input to wrapped action: ${allInputs.length} inputs`);
      core.debug(`Inputs: ${allInputs.join(', ')}`);
    } else {
      core.info('No inputs to pass to wrapped action');
    }
    
    return newEnv;
  }
}

module.exports = WitnessActionRunner;