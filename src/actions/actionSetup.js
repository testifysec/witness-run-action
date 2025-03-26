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

/**
 * Downloads a GitHub Action repository and creates an attestation of the download.
 * This creates a separate attestation for the download process to enhance provenance.
 */
async function downloadActionWithWitness(actionRef, witnessExePath, witnessOptions) {
  // Reuse the existing download function to avoid code duplication
  const tempDir = await downloadAndSetupAction(actionRef);
  core.info(`Downloaded action at: ${tempDir}, preparing attestation`);
  
  // Now that we have the repository cloned, run witness attestation on it
  const assembleWitnessArgs = require("../attestation/assembleWitnessArgs");
  
  // Only use git and github attestors for download attestation
  // Do NOT use user-provided attestors for security reasons
  const attestations = [
    'git',    // Git metadata
    'github'  // GitHub-specific context if available
  ]
  
  // Use provided download options, but ensure we have the necessary settings
  const downloadOptions = {
    ...witnessOptions,
    attestations,
    // Set working directory to the cloned repo
    workingdir: tempDir
  };
  
  // If no outfile specified, create a default one
  if (!downloadOptions.outfile) {
    downloadOptions.outfile = path.join(os.tmpdir(), `${downloadOptions.step}-attestation.json`);
  }
  
  // Run a simple command with witness to capture attestation of the cloned repo
  // Using 'git rev-parse HEAD' to get current commit hash and trigger git attestor
  const witnessArgs = assembleWitnessArgs(downloadOptions, ['git', 'rev-parse', 'HEAD']);
  
  let output = "";
  
  // Execute git rev-parse with witness to capture attestation
  core.info(`Running witness to attest cloned repository: ${witnessExePath} ${witnessArgs.join(" ")}`);
  await exec.exec(witnessExePath, witnessArgs, {
    cwd: tempDir,
    env: process.env,
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
      stderr: (data) => {
        output += data.toString();
      }
    }
  });
  
  core.info(`Successfully set up action at: ${tempDir} with attestation at ${downloadOptions.outfile}`);
  return {
    actionDir: tempDir,
    attestationOutput: output,
    attestationFile: downloadOptions.outfile
  };
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
  downloadActionWithWitness,
  getActionYamlPath,
  cleanUpDirectory
};