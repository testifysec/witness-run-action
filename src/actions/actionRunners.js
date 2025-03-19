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

module.exports = {
  runJsActionWithWitness,
  runCompositeActionWithWitness
};