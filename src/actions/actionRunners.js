/**
 * Runners for different types of GitHub Actions
 */
const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');
const os = require('os');

const assembleWitnessArgs = require('../attestation/assembleWitnessArgs');
const { executeCompositeUsesStep } = require('./compositeActionUtils');
const { executeCompositeShellStep } = require('./compositeActionUtils');
const { validateBooleanInput, isValidYamlBoolean } = require('../utils/booleanUtils');

/**
 * Docker command utilities
 */
const docker = {
  /**
   * Verify Docker is installed and available
   */
  async verifyInstallation() {
    try {
      await exec.exec('docker', ['--version']);
      return true;
    } catch (error) {
      throw new Error('Docker is not installed or not in the PATH');
    }
  },

  /**
   * Build a Docker image from Dockerfile
   */
  async buildImage(dockerfilePath, imageName, actionDir) {
    try {
      core.info(`Building Docker image ${imageName} from ${dockerfilePath}`);
      await exec.exec('docker', ['build', '-t', imageName, '-f', dockerfilePath, actionDir]);
      return imageName;
    } catch (error) {
      throw new Error(`Failed to build Docker image: ${error.message}`);
    }
  },

  /**
   * Pull a Docker image from a registry
   */
  async pullImage(imageReference) {
    try {
      // Remove docker:// prefix if present
      const image = imageReference.replace(/^docker:\/\//, '');
      core.info(`Pulling Docker image ${image}`);
      await exec.exec('docker', ['pull', image]);
      return image;
    } catch (error) {
      core.warning(`Failed to pull Docker image: ${error.message}. Will try to use it directly.`);
      // Return the image name without the prefix to try using it directly
      return imageReference.replace(/^docker:\/\//, '');
    }
  },

  /**
   * Parse and normalize Docker image reference
   */
  parseImageReference(imageReference) {
    if (!imageReference) {
      throw new Error('Image reference is required');
    }
    
    // Strip docker:// protocol prefix if present
    return imageReference.replace(/^docker:\/\//, '');
  }
};

/**
 * Runs a JavaScript GitHub Action using witness.
 */
async function runJsActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv) {
  const entryPoint = actionConfig.runs && actionConfig.runs.main;
  if (!entryPoint) {
    throw new Error('Entry point (runs.main) not defined in action metadata');
  }
  core.info(`Action entry point: ${entryPoint}`);

  const entryFile = path.join(actionDir, entryPoint);
  if (!fs.existsSync(entryFile)) {
    throw new Error(`Entry file ${entryFile} does not exist.`);
  }

  // Create absolute path for the entry file
  const args = assembleWitnessArgs(witnessOptions, ["node", entryFile]);
  // Command details not logged to protect secrets

  let output = "";
  // Use GitHub workspace as the working directory
  const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();
  core.info(`Running JavaScript action in workspace directory: ${workspaceDir}`);
  
  // Set NODE_PATH to include the action directory to help with requiring action modules
  const nodeEnv = { ...actionEnv || process.env };
  const nodePath = nodeEnv.NODE_PATH ? `${actionDir}:${nodeEnv.NODE_PATH}` : actionDir;
  nodeEnv.NODE_PATH = nodePath;

  // Add additional debugging for Git actions
  core.info(`Setting NODE_PATH to include action directory: ${nodePath}`);
  
  // Add special handling for GitHub Script action
  if (actionDir.toLowerCase().includes('github-script') || 
      entryFile.toLowerCase().includes('github-script')) {
    // Ensure script parameter is set
    if (!nodeEnv.INPUT_SCRIPT && actionEnv.script) {
      nodeEnv.INPUT_SCRIPT = actionEnv.script;
      core.info(`✅ Added missing script input for GitHub Script action`);
    }
    
    // Use the booleanUtils imported at the top of the file
    
    // Validate any boolean inputs for YAML 1.2 compliance
    const booleanInputsToCheck = ['INPUT_DEBUG', 'INPUT_GITHUB-TOKEN'];
    
    for (const inputKey of booleanInputsToCheck) {
      if (nodeEnv[inputKey] && typeof nodeEnv[inputKey] === 'string') {
        if (isValidYamlBoolean(nodeEnv[inputKey])) {
          const oldValue = nodeEnv[inputKey];
          const validatedValue = validateBooleanInput(oldValue);
          
          if (validatedValue !== oldValue) {
            nodeEnv[inputKey] = validatedValue;
            core.info(`✅ Validated boolean input ${inputKey} from ${oldValue} to ${validatedValue}`);
          }
        }
      }
    }
  }
  
  // booleanUtils is already imported in the GitHub Script action handler
  
  // Global handling for any action using booleanUtils
  // We no longer force normalization to lowercase but do validate YAML boolean format
  Object.keys(nodeEnv)
    .filter(key => key.startsWith('INPUT_') && 
      typeof nodeEnv[key] === 'string')
    .forEach(key => {
      const value = nodeEnv[key];
      
      // Only validate and potentially fix boolean inputs
      if (isValidYamlBoolean(value)) {
        // Use our validation function but preserve the original format if valid
        const validatedValue = validateBooleanInput(value);
        if (validatedValue !== value) {
          core.info(`✅ Fixed boolean input format: ${key} from ${value} to ${validatedValue}`);
          nodeEnv[key] = validatedValue;
        }
      }
    });
  
  // Debug important paths
  core.info(`DEBUG - Important paths:`);
  core.info(`  Action directory: ${actionDir}`);
  core.info(`  Workspace directory: ${workspaceDir}`);
  core.info(`  Current working directory: ${process.cwd()}`);
  
  // Debug the PATH environment variable
  core.info(`DEBUG - PATH: ${nodeEnv.PATH || '(not set)'}`);


  // Action metadata is already processed in commandRunners.js
  // No need to read and log it again here


  

  // Log that we're executing the witness command, but not the full command with arguments
  // that might contain sensitive information
  core.info(`DEBUG - About to execute witness command`);
  
  //debug log nodenv


  // Environment variables are not logged to protect secrets

  
  await exec.exec(witnessExePath, args, {
    cwd: workspaceDir,
    env: nodeEnv,
    listeners: {
      stdout: (data) => {
        const str = data.toString();
        output += str;
        
        // Log everything for better debugging
        if (str.includes('error') || str.includes('fatal')) {
          core.warning(`STDOUT (error detected): ${str.trim()}`);
        }
      },
      stderr: (data) => {
        const str = data.toString();
        output += str;
        
        // Process Witness stderr output, only warning on actual errors
        if (str.trim()) {
          const line = str.trim();
          if (line.includes('level=error') || line.includes('level=fatal') || line.includes('level=warning')) {
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

/**
 * Runs a composite GitHub Action using witness.
 * Executes each step sequentially, handling both 'run' and 'uses' steps.
 */
async function runCompositeActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv) {
  const steps = actionConfig.runs.steps;
  if (!steps || !Array.isArray(steps)) {
    throw new Error('Invalid composite action: missing or invalid steps array');
  }

  core.info(`Executing composite action with ${steps.length} steps`);
  
  // Initialize outputs and environment
  let output = "";
  const stepOutputs = {};
  const runEnv = { ...actionEnv };
  
  // Process inputs and add them to the environment
  if (actionConfig.inputs) {
    const { hasInputValue, getInputValue, getEnvKey } = require('../utils/envUtils');
    const { checkRequiredInput } = require('../utils/defaultsUtils');
    
    core.info(`Processing ${Object.keys(actionConfig.inputs).length} inputs from action config`);
    
    // This processing is for debugging only - defaults are already set in commandRunners.js
    for (const [inputName, inputConfig] of Object.entries(actionConfig.inputs)) {
      const inputEnvKey = getEnvKey(inputName);
      
      // Log the status of inputs for debugging
      if (hasInputValue(runEnv, inputName)) {
        const value = getInputValue(runEnv, inputName);
        core.info(`Found input: ${inputName}=${value}`);
      } else if (inputConfig.default) {
        core.info(`Input ${inputName} has default=${inputConfig.default} but environment not set yet`);
      } else if (inputConfig.required) {
        // Use our utility function to check required inputs consistently
        checkRequiredInput(runEnv, inputName, { errorOnMissing: true });
      }
      
      // Validate boolean inputs
      if (hasInputValue(runEnv, inputName) && 
          (inputConfig.type === 'boolean' || 
          isValidYamlBoolean(getInputValue(runEnv, inputName)))) {
        const currentValue = getInputValue(runEnv, inputName);
        const validatedValue = validateBooleanInput(currentValue);
        
        if (validatedValue !== currentValue) {
          runEnv[inputEnvKey] = validatedValue;
          core.info(`✅ Validated boolean input ${inputName} from ${currentValue} to ${validatedValue}`);
        }
      }
    }
  }
  
  // Environment variables are not logged to protect secrets
  
  // Execute each step sequentially
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    core.info(`Executing step ${i+1}/${steps.length}: ${step.name || 'unnamed step'}`);
    
    try {
      let stepOutput = "";
      
      if (step.run && (step.shell === 'bash' || !step.shell)) {
        // Process expression substitutions in the run command
        let processedRun = step.run;
        
        // Simple substitution of input expressions like ${{ inputs.name }}
        processedRun = processedRun.replace(/\$\{\{\s*inputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, inputName) => {
          const normalizedName = inputName.replace(/-/g, '_').toUpperCase();
          const value = runEnv[`INPUT_${normalizedName}`] || '';
          return value;
        });
        
        // Replace step outputs references
        processedRun = processedRun.replace(/\$\{\{\s*steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, stepId, outputName) => {
          const key = `steps.${stepId}.outputs.${outputName}`;
          return stepOutputs[key] || '';
        });
        
        const stepWithProcessedRun = { ...step, run: processedRun };
        stepOutput = await executeCompositeShellStep(stepWithProcessedRun, actionDir, witnessOptions, witnessExePath, runEnv, actionConfig);
      } else if (step.uses) {
        // Handle uses steps which reference other actions
        core.info(`Processing 'uses' step: ${step.uses}`);
        stepOutput = await executeCompositeUsesStep(step, actionDir, witnessOptions, witnessExePath, runEnv, stepOutputs);
      } else {
        // Skip unsupported step types
        core.warning(`Skipping unsupported step type at index ${i}: Currently we only support 'run' steps with 'bash' shell and 'uses' steps`);
        continue;
      }
      
      // If the step has an ID, capture its outputs for subsequent steps
      if (step.id) {
        core.info(`Step ${step.id} completed, parsing outputs`);
        
        // Look for outputs in the form of ::set-output name=key::value or echo "key=value" >> $GITHUB_OUTPUT
        const outputPattern = /::set-output name=([^:]+)::([^\n]*)|echo "([^"=]+)=([^"]*)" >> \$GITHUB_OUTPUT/g;
        let match;
        while ((match = outputPattern.exec(stepOutput)) !== null) {
          const outputName = match[1] || match[3];
          const outputValue = match[2] || match[4];
          
          if (outputName) {
            stepOutputs[`steps.${step.id}.outputs.${outputName}`] = outputValue;
            core.info(`Captured output ${outputName}=${outputValue} from step ${step.id}`);
            
            // Add to environment for future steps
            runEnv[`STEPS_${step.id.toUpperCase()}_OUTPUTS_${outputName.toUpperCase()}`] = outputValue;
          }
        }
      }
      
      output += stepOutput + "\n";
    } catch (error) {
      throw new Error(`Error executing step ${i+1}: ${error.message}`);
    }
  }
  
  return output;
}

/**
 * Runs a Docker container GitHub Action using witness.
 */
async function runDockerActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv = {}) {
  // Verify Docker is installed
  await docker.verifyInstallation();
  
  // Initialize environment and process input variables
  const runEnv = { ...actionEnv };
  
  // Process inputs and add them to the environment
  if (actionConfig.inputs) {
    const { hasInputValue, getInputValue, getEnvKey } = require('../utils/envUtils');
    const { checkRequiredInput } = require('../utils/defaultsUtils');
    
    core.info(`Processing ${Object.keys(actionConfig.inputs).length} inputs from action config`);
    
    // This processing is for debugging only - defaults are already set in commandRunners.js
    for (const [inputName, inputConfig] of Object.entries(actionConfig.inputs)) {
      const inputEnvKey = getEnvKey(inputName);
      
      // Log the status of inputs for debugging
      if (hasInputValue(runEnv, inputName)) {
        const value = getInputValue(runEnv, inputName);
        core.info(`Found input: ${inputName}=${value}`);
      } else if (inputConfig.default) {
        core.info(`Input ${inputName} has default=${inputConfig.default} but environment not set yet`);
      } else if (inputConfig.required) {
        // Use our utility function to check required inputs consistently
        checkRequiredInput(runEnv, inputName, { errorOnMissing: true });
      }
      
      // Validate boolean inputs
      if (hasInputValue(runEnv, inputName) && 
          (inputConfig.type === 'boolean' || 
          isValidYamlBoolean(getInputValue(runEnv, inputName)))) {
        const currentValue = getInputValue(runEnv, inputName);
        const validatedValue = validateBooleanInput(currentValue);
        
        if (validatedValue !== currentValue) {
          runEnv[inputEnvKey] = validatedValue;
          core.info(`✅ Validated boolean input ${inputName} from ${currentValue} to ${validatedValue}`);
        }
      }
    }
  }
  
  const image = actionConfig.runs.image;
  let dockerImage;
  
  // Check if this is a Dockerfile action or a pre-built image
  if (image.toLowerCase() === 'dockerfile') {
    // This is a Dockerfile action
    const dockerfilePath = path.join(actionDir, 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) {
      throw new Error(`Dockerfile not found at ${dockerfilePath}`);
    }
    
    // Generate unique image name
    const uniqueTag = `github-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Build the Docker image
    dockerImage = await docker.buildImage(dockerfilePath, uniqueTag, actionDir);
  } else if (image.startsWith('docker://')) {
    // This is a pre-built Docker image with the docker:// protocol prefix
    const imageWithoutPrefix = image.replace(/^docker:\/\//, '');
    core.info(`Using pre-built Docker image: ${imageWithoutPrefix}`);
    
    // Pull the image
    try {
      core.info(`Pulling Docker image: ${imageWithoutPrefix}`);
      await exec.exec('docker', ['pull', imageWithoutPrefix]);
      dockerImage = imageWithoutPrefix;
    } catch (error) {
      core.warning(`Error pulling Docker image: ${error.message}`);
      // Fall back to using the image directly in case it's already available locally
      dockerImage = imageWithoutPrefix;
      
      // Check if image exists locally
      try {
        core.info(`Checking if image exists locally: ${imageWithoutPrefix}`);
        const result = await exec.getExecOutput('docker', ['image', 'inspect', imageWithoutPrefix]);
        core.info(`Image exists locally, will use it: ${imageWithoutPrefix}`);
      } catch (inspectError) {
        core.warning(`Image doesn't exist locally either! This might fail: ${inspectError.message}`);
      }
    }
  } else {
    // Assume this is a regular Docker image name without protocol prefix
    core.info(`Using Docker image: ${image}`);
    
    // Attempt to pull the image first to ensure it's available
    try {
      core.info(`Pulling image: ${image}`);
      await exec.exec('docker', ['pull', image]);
    } catch (error) {
      core.warning(`Failed to pull image: ${error.message}. Will attempt to use the image directly.`);
    }
    
    dockerImage = image;
  }
  
  // Process entrypoint from action config
  const entrypoint = actionConfig.runs.entrypoint;
  
  // Process args from action config
  let args = actionConfig.runs.args || [];
  
  // Process args with input variables
  if (Array.isArray(args)) {
    args = args.map(arg => {
      // Skip null or undefined values or convert to empty string
      if (arg === null || arg === undefined) {
        core.debug(`Converting null/undefined argument to empty string`);
        return '';
      }

      // Ensure arg is a string
      const argStr = String(arg);
      
      // Replace expression placeholders with actual values
      return argStr.replace(/\$\{\{\s*inputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, inputName) => {
        const normalizedName = inputName.replace(/-/g, '_').toUpperCase();
        return runEnv[`INPUT_${normalizedName}`] || '';
      });
    });
  }
  
  // Process custom environment variables
  if (actionConfig.runs.env) {
    for (const [envName, envValue] of Object.entries(actionConfig.runs.env)) {
      // Skip null or undefined values
      if (envValue === null || envValue === undefined) {
        core.debug(`Skipping null/undefined environment variable: ${envName}`);
        continue;
      }

      // Ensure envValue is a string
      const envValueStr = String(envValue);
      
      // Replace expression placeholders with actual values
      const processedValue = envValueStr.replace(/\$\{\{\s*inputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, inputName) => {
        const normalizedName = inputName.replace(/-/g, '_').toUpperCase();
        return runEnv[`INPUT_${normalizedName}`] || '';
      });
      
      runEnv[envName] = processedValue;
    }
  }
  
  // Now set up the Docker run command arguments
  const dockerRunArgs = ['run', '--rm'];
  
  // Add volume for workspace
  if (process.env.GITHUB_WORKSPACE) {
    dockerRunArgs.push('-v', `${process.env.GITHUB_WORKSPACE}:/github/workspace`);
    
    // Set working directory to workspace
    dockerRunArgs.push('-w', '/github/workspace');
  } else {
    core.warning('GITHUB_WORKSPACE is not defined. This might cause issues with the Docker container.');
  }

  // Create GitHub-specific paths for outputs, env, etc.
  const tmpDir = os.tmpdir();
  const githubOutputPath = path.join(tmpDir, 'github_output');
  const githubEnvPath = path.join(tmpDir, 'github_env');
  const githubPathPath = path.join(tmpDir, 'github_path');
  const githubStepSummaryPath = path.join(tmpDir, 'github_step_summary');
  
  // Create empty files for GitHub paths
  try {
    fs.writeFileSync(githubOutputPath, '');
    fs.writeFileSync(githubEnvPath, '');
    fs.writeFileSync(githubPathPath, '');
    fs.writeFileSync(githubStepSummaryPath, '');
    
    // Mount these files into the container
    dockerRunArgs.push('-v', `${githubOutputPath}:/github/output`);
    dockerRunArgs.push('-v', `${githubEnvPath}:/github/env`);
    dockerRunArgs.push('-v', `${githubPathPath}:/github/path`);
    dockerRunArgs.push('-v', `${githubStepSummaryPath}:/github/step-summary`);
  } catch (error) {
    core.warning(`Failed to create GitHub paths: ${error.message}`);
  }
  
  // Add environment variables without logging them
  for (const [key, value] of Object.entries(runEnv)) {
    if (value !== undefined && value !== null) {
      dockerRunArgs.push('-e', `${key}=${value}`);
    }
  }
  
  // Add standard GitHub Actions environment variables
  dockerRunArgs.push('-e', 'GITHUB_OUTPUT=/github/output');
  dockerRunArgs.push('-e', 'GITHUB_ENV=/github/env');
  dockerRunArgs.push('-e', 'GITHUB_PATH=/github/path');
  dockerRunArgs.push('-e', 'GITHUB_STEP_SUMMARY=/github/step-summary');
  
  // Pass through other GitHub environment variables
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('GITHUB_') && !runEnv[key] && value !== undefined && value !== null) {
      dockerRunArgs.push('-e', `${key}=${value}`);
    }
  }
  
  // Add entrypoint if specified
  if (entrypoint) {
    dockerRunArgs.push('--entrypoint', entrypoint);
  }
  
  // Add the image name
  dockerRunArgs.push(dockerImage);
  
  // Add args if any
  if (args.length > 0) {
    dockerRunArgs.push(...args);
  }
  
  // Construct the witness command
  const witnessArgs = assembleWitnessArgs(witnessOptions, ['docker', ...dockerRunArgs]);
  // Command details not logged to protect secrets
  
  // Add more debug information about witness and environment
  core.debug(`Witness executable path: ${witnessExePath}`);
  core.debug(`Action directory: ${actionDir}`);
  core.debug(`Docker image: ${dockerImage}`);
  
  // Execute the command with witness attestation
  let output = "";
  
  // Dump complete debug information for Docker run command
  core.info(`===== Docker Runner Debug Information =====`);
  core.info(`Docker Image: ${dockerImage}`);
  core.info(`Entrypoint: ${entrypoint || '(default)'}`);
  core.info(`Args: ${args.join(' ') || '(none)'}`);
  core.info(`Witness Path: ${witnessExePath}`);
  core.info(`Working Directory: ${actionDir}`);
  
  // Don't log Docker run command with arguments that might contain secrets
  
  // Don't log the full witness command to avoid exposing secrets
  
  // Only log non-sensitive path information
  core.info(`GITHUB_WORKSPACE path: ${process.env['GITHUB_WORKSPACE'] || '(not set)'}`);
  // No need to log other environment variables
  
  try {
    // Verbose output for all witness command output
    core.info(`Running witness command with Docker action...`);
    
    await exec.exec(witnessExePath, witnessArgs, {
      cwd: actionDir,
      env: actionEnv || process.env,
      listeners: {
        stdout: (data) => {
          const str = data.toString();
          output += str;
          
          // Log all witness output for debugging
          if (str.trim()) {
            core.info(`Witness stdout: ${str.trim()}`);
          }
        },
        stderr: (data) => {
          const str = data.toString();
          output += str;
          
          // Process Witness stderr output, only warning on actual errors
          if (str.trim()) {
            const line = str.trim();
            if (line.includes('level=error') || line.includes('level=fatal') || line.includes('level=warning')) {
              core.warning(`Witness stderr: ${line}`);
            } else {
              // Just info or debug messages, use core.debug
              core.debug(`Witness stderr: ${line}`);
            }
          }
        },
      },
    });
    
    core.info(`Witness command completed successfully`);
  } catch (error) {
    core.error(`Failed to execute Docker action with witness: ${error.message}`);
    // Don't log command arguments that may contain secrets
    
    // Dump additional error information if available
    if (error.stdout) core.error(`Error stdout: ${error.stdout}`);
    if (error.stderr) core.error(`Error stderr: ${error.stderr}`);
    
    throw error;
  }
  
  return output;
}

module.exports = {
  runJsActionWithWitness,
  runCompositeActionWithWitness,
  runDockerActionWithWitness
};