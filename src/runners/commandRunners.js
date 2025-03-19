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
  core.info(`Running witness command: ${witnessExePath} ${args.join(" ")}`);

  let output = "";
  await exec.exec(witnessExePath, args, {
    cwd: process.env.GITHUB_WORKSPACE || process.cwd(),
    env: process.env,
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

module.exports = {
  runActionWithWitness,
  runDirectCommandWithWitness
};