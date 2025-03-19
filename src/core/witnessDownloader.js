/**
 * Functionality for downloading and setting up the witness binary
 */
const core = require("@actions/core");
const fs = require("fs");
const path = require("path");
const tc = require("@actions/tool-cache");

/**
 * Downloads and sets up the witness binary.
 * Checks for a cached version first; if not found, downloads, extracts, caches, and returns its path.
 * Returns the full path to the witness executable, not just the directory.
 */
async function downloadAndSetupWitness() {
  const witnessInstallDir = core.getInput("witness-install-dir") || "./";
  const version = core.getInput("version") || "0.8.1";

  // Check cache first
  const cachedDir = tc.find("witness", version);
  if (cachedDir) {
    const witnessExePath = path.join(cachedDir, "witness");
    console.log(`Found cached witness at: ${witnessExePath}`);
    core.addPath(cachedDir);
    return witnessExePath;  // Return the full path to the executable
  }

  // Construct download URL based on OS
  console.log("Witness not found in cache, downloading now");
  const baseUrl = `https://github.com/in-toto/witness/releases/download/v${version}`;
  let witnessTar;
  if (process.platform === "win32") {
    witnessTar = await tc.downloadTool(`${baseUrl}/witness_${version}_windows_amd64.tar.gz`);
  } else if (process.platform === "darwin") {
    witnessTar = await tc.downloadTool(`${baseUrl}/witness_${version}_darwin_amd64.tar.gz`);
  } else {
    witnessTar = await tc.downloadTool(`${baseUrl}/witness_${version}_linux_amd64.tar.gz`);
  }

  // Ensure installation directory exists
  if (!fs.existsSync(witnessInstallDir)) {
    console.log(`Creating witness install directory at ${witnessInstallDir}`);
    fs.mkdirSync(witnessInstallDir, { recursive: true });
  }

  console.log(`Extracting witness to: ${witnessInstallDir}`);
  const extractedDir = await tc.extractTar(witnessTar, witnessInstallDir);
  console.log(`Debug: Extracted witness directory: ${extractedDir}`);

  // Prepare witness executable path
  const witnessExePath = path.join(extractedDir, "witness");
  console.log(`Debug: Witness executable location before chmod: ${witnessExePath}`);
  try {
    fs.chmodSync(witnessExePath, '755');
  } catch (error) {
    core.warning(`Failed to make witness executable: ${error.message}`);
  }

  // Cache the binary and add its directory to PATH
  const cachedPath = await tc.cacheFile(witnessExePath, "witness", "witness", version);
  console.log(`Debug: Witness cached at: ${cachedPath}`);
  core.addPath(path.dirname(cachedPath));
  console.log(`Debug: Added cached directory to PATH: ${path.dirname(cachedPath)}`);

  // Verify that the returned path includes the executable name
  if (!cachedPath.endsWith('witness')) {
    const fullPath = path.join(cachedPath, 'witness');
    console.log(`Debug: Adding executable name to path: ${fullPath}`);
    return fullPath;
  }

  return cachedPath;
}

module.exports = {
  downloadAndSetupWitness
};