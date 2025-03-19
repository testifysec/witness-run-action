/**
 * Functions for setting up GitHub Actions
 */
const core = require("@actions/core");
const exec = require("@actions/exec");
const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Downloads a GitHub Action repository based on the given reference (format: owner/repo@ref)
 * and checks out the specific ref.
 */
async function downloadAndSetupAction(actionRef) {
  const [ownerRepo, ref] = actionRef.split('@');
  const [owner, repo] = ownerRepo.split('/');
  
  if (!owner || !repo || !ref) {
    throw new Error(`Invalid action reference: ${actionRef}. Format should be owner/repo@ref`);
  }
  
  core.info(`Action details - owner: ${owner}, repo: ${repo}, ref: ${ref}`);
  
  // Create a temporary directory and clone the repository
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'action-'));
  core.info(`Created temporary directory for action: ${tempDir}`);
  
  await exec.exec('git', ['clone', `https://github.com/${owner}/${repo}.git`, tempDir]);
  core.info('Cloned action repository');
  
  // Checkout the specified ref
  await exec.exec('git', ['checkout', ref], { cwd: tempDir });
  core.info(`Checked out ref: ${ref}`);
  
  return tempDir;
}

/**
 * Extracts the path to the action metadata file (action.yml or action.yaml).
 * Includes safety checks to prevent path traversal.
 */
function getActionYamlPath(actionDir) {
  // Validate actionDir is a string to prevent undefined/null issues
  if (typeof actionDir !== 'string') {
    throw new Error(`Invalid action directory: ${actionDir}`);
  }
  
  // Ensure we're only looking for action.yml/yaml in the exact directory, not in subdirectories
  const actionYmlPath = path.join(actionDir, 'action.yml');
  const actionYamlPath = path.join(actionDir, 'action.yaml');
  
  // Verify the resolved paths are within the action directory (prevent path traversal)
  if (!actionYmlPath.startsWith(actionDir) || !actionYamlPath.startsWith(actionDir)) {
    throw new Error('Security error: Action metadata path resolves outside the action directory');
  }
  
  if (fs.existsSync(actionYmlPath)) {
    return actionYmlPath;
  } else if (fs.existsSync(actionYamlPath)) {
    return actionYamlPath;
  } else {
    throw new Error('Could not find action.yml or action.yaml in the action repository');
  }
}

/**
 * Removes the temporary action directory.
 */
function cleanUpDirectory(dir) {
  try {
    fs.rmdirSync(dir, { recursive: true });
  } catch (error) {
    core.warning(`Failed to clean up action directory: ${error.message}`);
  }
}

module.exports = {
  downloadAndSetupAction,
  getActionYamlPath,
  cleanUpDirectory
};