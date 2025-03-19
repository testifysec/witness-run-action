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

  const args = assembleWitnessArgs(witnessOptions, ["node", entryFile]);
  core.info(`Running witness command: ${witnessExePath} ${args.join(" ")}`);

  let output = "";
  await exec.exec(witnessExePath, args, {
    cwd: actionDir,
    env: actionEnv || process.env,
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
      stderr: (data) => {
        output += data.toString();
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
    core.info(`Processing ${Object.keys(actionConfig.inputs).length} inputs from action config`);
    
    for (const [inputName, inputConfig] of Object.entries(actionConfig.inputs)) {
      const inputKey = `INPUT_${inputName.replace(/-/g, '_').toUpperCase()}`;
      
      // Check if the input was provided, or use default
      if (runEnv[inputKey]) {
        core.info(`Using provided input: ${inputName}=${runEnv[inputKey]}`);
      } else if (inputConfig.default) {
        runEnv[inputKey] = inputConfig.default;
        core.info(`Using default input: ${inputName}=${inputConfig.default}`);
      } else if (inputConfig.required) {
        throw new Error(`Required input '${inputName}' was not provided`);
      }
    }
  }
  
  // Debug: Log environment variables for troubleshooting
  core.info(`Environment variables passed to step (input-related only):`);
  Object.keys(runEnv)
    .filter(key => key.startsWith('INPUT_'))
    .forEach(key => {
      core.info(`  ${key}=${runEnv[key]}`);
    });
  
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
    core.info(`Processing ${Object.keys(actionConfig.inputs).length} inputs from action config`);
    
    for (const [inputName, inputConfig] of Object.entries(actionConfig.inputs)) {
      const inputKey = `INPUT_${inputName.replace(/-/g, '_').toUpperCase()}`;
      
      // Check if the input was provided, or use default
      if (runEnv[inputKey]) {
        core.info(`Using provided input: ${inputName}=${runEnv[inputKey]}`);
      } else if (inputConfig.default) {
        runEnv[inputKey] = inputConfig.default;
        core.info(`Using default input: ${inputName}=${inputConfig.default}`);
      } else if (inputConfig.required) {
        throw new Error(`Required input '${inputName}' was not provided`);
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
    core.info(`Using pre-built Docker image: ${image}`);
    dockerImage = await docker.pullImage(image);
  } else {
    // Assume this is a regular Docker image name without protocol prefix
    core.info(`Using Docker image: ${image}`);
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
  
  // Add environment variables
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
  core.info(`Running witness command: ${witnessExePath} ${witnessArgs.join(" ")}`);
  
  // Add more debug information about witness and environment
  core.debug(`Witness executable path: ${witnessExePath}`);
  core.debug(`Action directory: ${actionDir}`);
  core.debug(`Docker image: ${dockerImage}`);
  
  // Execute the command with witness attestation
  let output = "";
  try {
    await exec.exec(witnessExePath, witnessArgs, {
      cwd: actionDir,
      env: actionEnv || process.env,
      listeners: {
        stdout: (data) => {
          const str = data.toString();
          output += str;
          
          // Log witness-related debug info
          if (str.includes('witness:') || str.includes('error:')) {
            core.debug(`Witness output: ${str.trim()}`);
          }
        },
        stderr: (data) => {
          const str = data.toString();
          output += str;
          core.debug(`Witness stderr: ${str.trim()}`);
        },
      },
    });
  } catch (error) {
    core.error(`Failed to execute Docker action with witness: ${error.message}`);
    core.error(`Witness args: ${witnessArgs.join(' ')}`);
    core.error(`Docker command: docker ${dockerRunArgs.join(' ')}`);
    throw error;
  }
  
  return output;
}

module.exports = {
  runJsActionWithWitness,
  runCompositeActionWithWitness,
  runDockerActionWithWitness
};