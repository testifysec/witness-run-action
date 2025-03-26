/**
 * Functionality for downloading and setting up the witness binary
 * Uses GitHub Actions Tool Cache for efficient reuse
 */
const core = require("@actions/core");
const fs = require("fs");
const path = require("path");
const tc = require("@actions/tool-cache");
const os = require("os");

/**
 * Downloads and sets up the witness binary.
 * Checks for a cached version first; if not found, downloads, extracts, caches, and returns its path.
 * Returns the full path to the witness executable, not just the directory.
 */
async function downloadAndSetupWitness() {
  const version = core.getInput("witness_version") || "0.8.1";
  core.info(`Setting up Witness version ${version}`);

  // Check cache first
  let cachedPath = tc.find("witness", version);
  if (cachedPath) {
    const witnessExePath = path.join(cachedPath, "witness");
    core.info(`✅ Found cached Witness at: ${witnessExePath}`);
    core.addPath(cachedPath);
    return witnessExePath;  // Return the full path to the executable
  }

  // Construct download URL based on OS
  core.info(`⬇️ Witness version ${version} not found in cache, downloading now...`);
  
  // Determine OS-specific archive name
  let archiveFile;
  if (process.platform === "win32") {
    archiveFile = `witness_${version}_windows_amd64.tar.gz`;
  } else if (process.platform === "darwin") {
    archiveFile = `witness_${version}_darwin_amd64.tar.gz`;
  } else {
    archiveFile = `witness_${version}_linux_amd64.tar.gz`;
  }
  
  const downloadUrl = `https://github.com/in-toto/witness/releases/download/v${version}/${archiveFile}`;
  core.info(`Downloading from: ${downloadUrl}`);
  
  // Download the archive
  let downloadPath;
  try {
    downloadPath = await tc.downloadTool(downloadUrl);
    core.info(`📦 Downloaded Witness archive to: ${downloadPath}`);
  } catch (error) {
    throw new Error(`Failed to download Witness: ${error.message}`);
  }

  // Create a temporary directory for extraction
  const tempDir = path.join(os.tmpdir(), 'witness-extract-' + Math.random().toString(36).substring(7));
  fs.mkdirSync(tempDir, { recursive: true });
  core.info(`📂 Created temporary directory: ${tempDir}`);

  // Extract the archive
  let extractedDir;
  try {
    extractedDir = await tc.extractTar(downloadPath, tempDir);
    core.info(`📤 Extracted Witness to: ${extractedDir}`);
  } catch (error) {
    throw new Error(`Failed to extract Witness archive: ${error.message}`);
  }

  // Prepare witness executable path
  const witnessExePath = path.join(extractedDir, "witness");
  core.info(`Witness executable path: ${witnessExePath}`);
  
  // Make the binary executable
  try {
    fs.chmodSync(witnessExePath, '755');
    core.info(`✅ Made Witness executable`);
  } catch (error) {
    core.warning(`⚠️ Failed to make Witness executable: ${error.message}`);
  }

  // Cache the binary
  try {
    cachedPath = await tc.cacheFile(witnessExePath, "witness", "witness", version);
    core.info(`✅ Cached Witness at: ${cachedPath}`);
    core.addPath(path.dirname(cachedPath));
    core.info(`✅ Added Witness to PATH: ${path.dirname(cachedPath)}`);
  } catch (error) {
    throw new Error(`Failed to cache Witness: ${error.message}`);
  }

  // Clean up the temp directory (optional, as the runner will do this automatically)
  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    core.info(`🧹 Cleaned up temporary directory`);
  } catch (error) {
    core.warning(`⚠️ Failed to clean up temporary directory: ${error.message}`);
  }

  return cachedPath.endsWith('witness') ? cachedPath : path.join(cachedPath, 'witness');
}

module.exports = {
  downloadAndSetupWitness
};