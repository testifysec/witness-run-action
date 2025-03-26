/**
 * Utilities for working with composite GitHub Actions
 */
const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');
const os = require('os');

const assembleWitnessArgs = require('../attestation/assembleWitnessArgs');
const { downloadAndSetupAction, getActionYamlPath, cleanUpDirectory } = require('./actionSetup');
const { detectActionType } = require('./actionUtils');
const yaml = require('js-yaml');

/**
 * Executes a shell command step from a composite action
 */
async function executeCompositeShellStep(step, actionDir, witnessOptions, witnessExePath, env, actionConfig) {
  if (!step.run) {
    throw new Error('Invalid shell step: missing run command');
  }
  
  // Process the script content to replace GitHub expressions before execution
  let scriptContent = step.run;
  
  // Replace common GitHub expressions
  scriptContent = scriptContent.replace(/\$\{\{\s*github\.action_path\s*\}\}/g, actionDir);
  
  // Replace inputs expressions
  scriptContent = scriptContent.replace(/\$\{\{\s*inputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, inputName) => {
    const normalizedName = inputName.replace(/-/g, '_').toUpperCase();
    const envVarName = `INPUT_${normalizedName}`;
    if (env[envVarName]) {
      return env[envVarName];
    }
    // Try to find a default in the action config
    if (actionConfig.inputs && actionConfig.inputs[inputName] && actionConfig.inputs[inputName].default) {
      return actionConfig.inputs[inputName].default;
    }
    return '';
  });
  
  // Replace step outputs expressions
  scriptContent = scriptContent.replace(/\$\{\{\s*steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, stepId, outputName) => {
    const envVarName = `STEPS_${stepId.toUpperCase()}_OUTPUTS_${outputName.toUpperCase()}`;
    return env[envVarName] || '';
  });
  
  // Special handling for adding action directory to PATH
  // If the script adds an entry to GITHUB_PATH, directly modify PATH for subsequent steps
  if (scriptContent.includes('GITHUB_PATH') && scriptContent.includes('>>')) {
    // For this specific case where adding to GITHUB_PATH, set the PATH for all subsequent steps
    if (scriptContent.includes(actionDir)) {
      core.info(`Detected PATH update to include action directory: ${actionDir}`);
      // Add the action directory to PATH environment variable for subsequent steps
      env.PATH = `${actionDir}:${env.PATH || ''}`;
    }
  }
  
  // Create a temporary script file with the processed content
  const scriptPath = path.join(os.tmpdir(), `witness-step-${Date.now()}.sh`);
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  
  core.info(`Executing composite shell step in directory: ${actionDir}`);
  core.info(`Created temporary script at: ${scriptPath}`);
  
  // Log the processed script content for debugging (debug level only)
  core.debug(`Script content after processing expressions:`);
  core.debug(`---BEGIN SCRIPT---`);
  core.debug(scriptContent);
  core.debug(`---END SCRIPT---`);
  
  // For commands that might need executables from the action directory,
  // we need to ensure the action directory is in the PATH
  if (!env.PATH) {
    env.PATH = process.env.PATH || '';
  }
  
  // Ensure action directory is in PATH
  if (!env.PATH.includes(actionDir)) {
    core.info(`Adding action directory to PATH: ${actionDir}`);
    env.PATH = `${actionDir}:${env.PATH}`;
  }
  
  // Use bash to execute the script directly - avoid shell command injection by using an array
  // Instead of string interpolation, use an array to avoid command injection
  const shellCommand = ['bash', '-e', scriptPath];
  
  // Pass the command array directly, no need for regex parsing which could introduce security issues
  const commandArray = shellCommand;
  const args = assembleWitnessArgs(witnessOptions, commandArray);
  // Command details not logged to protect secrets

  let output = "";
  try {
    // Use GitHub workspace as the working directory instead of action directory
    const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();
    core.info(`Running composite shell step in workspace directory: ${workspaceDir}`);
    await exec.exec(witnessExePath, args, {
      cwd: workspaceDir,  // Use the workspace directory as working directory
      env: env,           // Pass the step environment variables
      listeners: {
        stdout: (data) => {
          output += data.toString();
        },
        stderr: (data) => {
          output += data.toString();
        },
      },
    });
  } finally {
    // Clean up the temporary script file
    try {
      fs.unlinkSync(scriptPath);
    } catch (error) {
      core.warning(`Failed to clean up temporary script: ${error.message}`);
    }
  }
  
  return output;
}

/**
 * Executes a 'uses' step from a composite action
 * Handles both local and GitHub-hosted actions referenced by the 'uses' keyword.
 */
async function executeCompositeUsesStep(step, parentActionDir, witnessOptions, witnessExePath, parentEnv, stepOutputs) {
  if (!step.uses) {
    throw new Error('Invalid uses step: missing uses reference');
  }

  core.info(`Executing 'uses' step: ${step.uses}`);
  
  // Prepare environment for the nested action
  const nestedEnv = { ...parentEnv };
  
  // Process any 'with' inputs for the nested action
  if (step.with) {
    core.info(`Processing 'with' inputs for nested action`);
    for (const [inputName, inputValue] of Object.entries(step.with)) {
      // Process expressions in the input value if it's a string
      let processedValue = inputValue;
      if (typeof inputValue === 'string') {
        // Handle expressions like ${{ steps.previous-step.outputs.output-name }}
        processedValue = inputValue.replace(/\$\{\{\s*steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, stepId, outputName) => {
          const key = `steps.${stepId}.outputs.${outputName}`;
          return stepOutputs[key] || '';
        });
        
        // Handle expressions like ${{ inputs.name }}
        processedValue = processedValue.replace(/\$\{\{\s*inputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, inputParam) => {
          const inputEnvVar = `INPUT_${inputParam.replace(/-/g, '_').toUpperCase()}`;
          const value = parentEnv[inputEnvVar] || '';
          core.info(`Replacing input expression inputs.${inputParam} with value: ${value}`);
          return value;
        });
      }
      
      const inputKey = `INPUT_${inputName.replace(/-/g, '_').toUpperCase()}`;
      nestedEnv[inputKey] = processedValue;
      // Don't log input values to prevent exposing secrets
      
      // Debug logging about what keys we're setting
      core.debug(`Added env var '${inputKey}' with value type '${typeof processedValue}'`);
    }
  }
  
  // Debug: Log if GITHUB_TOKEN exists in the environments (but not the token itself)
  core.debug(`Token available in parent env: ${!!parentEnv.GITHUB_TOKEN}`);
  core.debug(`Token available in nested env: ${!!nestedEnv.GITHUB_TOKEN}`);
  
  // Determine action type and resolve location
  let actionDir;
  let actionReference = step.uses;
  
  // Handle local action reference (./ or ../ format)
  if (actionReference.startsWith('./') || actionReference.startsWith('../')) {
    // Validate action reference doesn't contain potentially dangerous path components
    if (actionReference.includes('\\') || actionReference.includes('//')) {
      throw new Error(`Invalid action reference path: ${actionReference} contains unsafe path components`);
    }
    
    core.info(`Resolving local action reference: ${actionReference}`);
    core.info(`Parent action directory: ${parentActionDir}`);
    
    // Log working directory and GITHUB_WORKSPACE
    core.info(`Current working directory: ${process.cwd()}`);
    core.info(`GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE || 'not set'}`);
    
    // First, try resolving path relative to parent action
    const actionDirFromParent = path.resolve(parentActionDir, actionReference);
    
    // Validate the resolved path doesn't escape outside the repository root
    const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();
    if (!actionDirFromParent.startsWith(workspaceDir) && !actionDirFromParent.startsWith(parentActionDir)) {
      throw new Error(`Security error: Action path would resolve outside the repository: ${actionDirFromParent}`);
    }
    
    core.info(`Checking if action exists at path relative to parent: ${actionDirFromParent}`);
    
    const hasActionYml = fs.existsSync(path.join(actionDirFromParent, 'action.yml'));
    const hasActionYaml = fs.existsSync(path.join(actionDirFromParent, 'action.yaml'));
    core.info(`action.yml exists at parent-relative path: ${hasActionYml}`);
    core.info(`action.yaml exists at parent-relative path: ${hasActionYaml}`);
    
    if (hasActionYml || hasActionYaml) {
      actionDir = actionDirFromParent;
      core.info(`Resolved local action directory (relative to parent): ${actionDir}`);
    } else {
      // If not found, try resolving from workspace root
      const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();
      
      // Try with and without the leading ./
      const pathWithoutDot = actionReference.replace(/^\.\//, '');
      core.info(`Trying workspace-relative path without leading ./: ${pathWithoutDot}`);
      
      const actionDirFromWorkspace = path.resolve(workspaceDir, pathWithoutDot);
      
      // Validate the resolved path doesn't escape outside the repository root
      if (!actionDirFromWorkspace.startsWith(workspaceDir)) {
        throw new Error(`Security error: Action path would resolve outside the repository: ${actionDirFromWorkspace}`);
      }
      
      core.info(`Checking if action exists at path relative to workspace: ${actionDirFromWorkspace}`);
      
      const wsHasActionYml = fs.existsSync(path.join(actionDirFromWorkspace, 'action.yml'));
      const wsHasActionYaml = fs.existsSync(path.join(actionDirFromWorkspace, 'action.yaml'));
      core.info(`action.yml exists at workspace-relative path: ${wsHasActionYml}`);
      core.info(`action.yaml exists at workspace-relative path: ${wsHasActionYaml}`);
      
      if (wsHasActionYml || wsHasActionYaml) {
        actionDir = actionDirFromWorkspace;
        core.info(`Resolved local action directory (relative to workspace): ${actionDir}`);
      } else {
        // Log critical paths that were checked, without excessive directory listings
        core.info(`Failed to find action at either parent-relative or workspace-relative paths.`);
        core.info(`Paths checked: 
          - Parent-relative: ${actionDirFromParent}
          - Workspace-relative: ${actionDirFromWorkspace}
          - Common location: ${path.join(workspaceDir, '.github', 'actions')}
        `);
        
        throw new Error(`Could not find action at ${actionReference} (tried both relative to parent action and workspace root)`);
      }
    }
  } 
  // Handle GitHub-hosted action (owner/repo@ref format)
  else if (actionReference.includes('@')) {
    core.info(`Downloading GitHub-hosted action: ${actionReference}`);
    actionDir = await downloadAndSetupAction(actionReference);
    core.info(`Downloaded GitHub action to: ${actionDir}`);
  } 
  // Handle action reference without explicit ref (defaults to latest)
  else if (actionReference.includes('/')) {
    core.info(`Downloading GitHub-hosted action with implicit ref: ${actionReference}@main`);
    actionDir = await downloadAndSetupAction(`${actionReference}@main`);
    core.info(`Downloaded GitHub action to: ${actionDir}`);
  } 
  else {
    throw new Error(`Unsupported action reference format: ${actionReference}`);
  }
  
  try {
    // Get action metadata
    const actionYmlPath = getActionYamlPath(actionDir);
    const actionConfig = yaml.load(fs.readFileSync(actionYmlPath, 'utf8'));
    
    // Detect action type
    const actionType = detectActionType(actionConfig);
    core.info(`Nested action type: ${actionType}`);
    
    // Execute the action based on its type
    let output = "";
    
    switch (actionType) {
      case 'javascript':
        output = await getActionRunners().runJsActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, nestedEnv);
        break;
      case 'composite':
        output = await getActionRunners().runCompositeActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, nestedEnv);
        break;
      case 'docker':
        throw new Error('Docker-based actions are not yet supported in nested actions');
      default:
        throw new Error(`Unsupported nested action type: ${actionType}`);
    }
    
    // Process action outputs if defined
    if (actionConfig.outputs) {
      core.info('Processing nested action outputs');
      for (const [outputName, outputConfig] of Object.entries(actionConfig.outputs)) {
        // Extract the value from the expression
        if (outputConfig.value && typeof outputConfig.value === 'string') {
          const valueMatch = outputConfig.value.match(/\$\{\{\s*steps\.([^.]+)\.outputs\.([^}]+)\s*\}\}/);
          if (valueMatch) {
            const [_, stepId, stepOutputName] = valueMatch;
            const key = `steps.${stepId}.outputs.${stepOutputName}`;
            
            // Access the output from the nested action's step outputs
            const outputValue = stepOutputs[key] || '';
            
            // Make this output available to the parent action using a special format
            const nestedOutputKey = `NESTED_ACTION_OUTPUT_${outputName.replace(/-/g, '_').toUpperCase()}`;
            parentEnv[nestedOutputKey] = outputValue;
            
            // Add to the step.id.outputs map if the current step has an ID
            if (step.id) {
              stepOutputs[`steps.${step.id}.outputs.${outputName}`] = outputValue;
              core.info(`Propagated nested action output: ${outputName}=${outputValue}`);
            }
          }
        }
      }
    }
    
    return output;
  } finally {
    // Clean up if this was a downloaded action (not a local reference)
    if (!actionReference.startsWith('./')) {
      cleanUpDirectory(actionDir);
    }
  }
}

// To avoid circular dependencies, we will use the dynamic import approach
// This allows the current module to be loaded first before trying to import actionRunners
function getActionRunners() {
  // Only import when needed
  return require('./actionRunners');
}

module.exports = {
  executeCompositeShellStep,
  executeCompositeUsesStep
};