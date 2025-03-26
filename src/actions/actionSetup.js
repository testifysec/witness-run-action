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
  
  // Clone the repository with the specified ref
  core.info(`Cloning repository: ${owner}/${repo}@${ref}`);
  try {
    await exec.exec('git', [
      'clone',
      '--depth=1',
      '--branch', ref,
      `https://github.com/${owner}/${repo}.git`,
      tempDir
    ]);
  } catch (error) {
    // If clone with specific branch fails, try regular clone and checkout
    core.info(`Branch clone failed, trying regular clone and checkout`);
    await exec.exec('git', [
      'clone',
      `https://github.com/${owner}/${repo}.git`,
      tempDir
    ]);
    
    // Checkout the specified ref
    core.info(`Checking out ref: ${ref}`);
    await exec.exec('git', ['checkout', ref], { cwd: tempDir });
  }
  
  core.info(`Successfully set up action at: ${tempDir}`);
  return tempDir;
}
  

// Import the function from actionUtils to avoid duplication
const { getActionYamlPath } = require('./actionUtils');

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