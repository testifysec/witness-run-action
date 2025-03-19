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
      core.info(`Executing Docker command for direct image reference: ${actionRef}`);
      return this.executeDockerImageCommand(actionRef);
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
   * Executes a direct Docker image as a command with Witness
   */
  async executeDockerImageCommand(dockerImageRef) {
    core.info(`Running direct Docker image: ${dockerImageRef}`);
    
    // Get the Docker image name by removing the docker:// prefix
    const dockerImage = dockerImageRef.replace(/^docker:\/\//, '');
    
    // Get any command that was provided
    const command = core.getInput('command');
    
    // Prepare the Docker command to run the image
    let dockerCommand = `docker run --rm`;
    
    // Set up the environment variables for the Docker container
    const env = this.getWrappedActionEnv();
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith('INPUT_') && value !== undefined && value !== null) {
        dockerCommand += ` -e ${key}=${value}`;
      }
    }
    
    // Add workspace volume if available
    if (process.env.GITHUB_WORKSPACE) {
      dockerCommand += ` -v ${process.env.GITHUB_WORKSPACE}:/github/workspace`;
      dockerCommand += ` -w /github/workspace`;
    }
    
    // Add the Docker image
    dockerCommand += ` ${dockerImage}`;
    
    // Add the command if specified
    if (command) {
      dockerCommand += ` /bin/sh -c "${command}"`;
    }
    
    core.info(`Executing Docker command: ${dockerCommand}`);
    
    // Create a copy of witness options with signing disabled
    const witnessDockerOptions = { ...this.witnessOptions };
    
    // Ensure signing is disabled since we're not running in a Git context
    // This prevents the "failed to load signers" error when running direct Docker commands
    witnessDockerOptions.enableSigstore = false;
    witnessDockerOptions.enableArchivista = false;
    
    core.info(`Disabling signers for direct Docker image command`);
    
    // Run the Docker command with witness and modified options
    return await runDirectCommandWithWitness(
      dockerCommand,
      witnessDockerOptions,
      this.witnessExePath
    );
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
    const newEnv = { ...process.env };
    const passedInputs = new Set();
    
    // Pass all direct inputs that are not part of witness options.
    const witnessInputNames = new Set(
      [
        "witness-install-dir", "archivista-server", "attestations", "attestor-link-export", "attestor-maven-pom-path",
        "attestor-sbom-export", "attestor-slsa-export", "enable-sigstore", "command", "certificate", "enable-archivista",
        "fulcio", "fulcio-oidc-client-id", "fulcio-oidc-issuer", "fulcio-token", "intermediates", "key", "outfile",
        "product-exclude-glob", "product-include-glob", "spiffe-socket", "step", "timestamp-servers", "trace", "version",
        "workingdir", "action-ref"
      ].map(name => name.toLowerCase())
    );
    
    // Debug: Log existing environment variables that might be relevant
    core.info('Debug: Environment variables in getWrappedActionEnv:');
    ['GITHUB_TOKEN', 'INPUT_GITHUB_TOKEN', 'INPUT_GITHUB-TOKEN', 'INPUT_TOKEN'].forEach(key => {
      if (process.env[key]) {
        core.info(`  ${key} is defined`);
      }
    });
    
    // Log all INPUT_ environment variables
    core.info('All INPUT_ environment variables:');
    for (const key in process.env) {
      if (key.startsWith('INPUT_')) {
        core.debug(`  ${key}=${process.env[key]}`);
      }
    }
    
    // Pass through all direct inputs, whether they are part of witness options or not
    // This ensures all inputs are available to the wrapped Docker container or action
    for (const key in process.env) {
      const match = key.match(/^INPUT_(.+)$/);
      if (match) {
        const inputName = match[1].toLowerCase();
        // We need to pass all inputs to the Docker container, even those used by witness
        if (!passedInputs.has(inputName)) {
          core.info(`Passing input to wrapped action: ${inputName}=${process.env[key]}`);
          passedInputs.add(inputName);
        }
      }
    }
    return newEnv;
  }
}

module.exports = WitnessActionRunner;