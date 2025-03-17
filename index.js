const core = require("@actions/core");
const exec = require("@actions/exec");
const fs = require("fs");
const os = require("os");
const path = require("path");
const tc = require("@actions/tool-cache");
const yaml = require("js-yaml");

/**
 * Downloads and sets up the witness binary.
 * Checks for a cached version first; if not found, downloads, extracts, caches, and returns its path.
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
    return path.resolve(witnessExePath);
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

  return path.resolve(cachedPath);
}

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
 */
function getActionYamlPath(actionDir) {
  let actionYmlPath = path.join(actionDir, 'action.yml');
  if (!fs.existsSync(actionYmlPath)) {
    actionYmlPath = path.join(actionDir, 'action.yaml');
    if (!fs.existsSync(actionYmlPath)) {
      throw new Error('Could not find action.yml or action.yaml in the action repository');
    }
  }
  return actionYmlPath;
}

/**
 * Builds the witness command arguments based on the provided options.
 * The `extraArgs` parameter can include command-specific arguments.
 */
function assembleWitnessArgs(witnessOptions, extraArgs = []) {
  const cmd = ["run"];
  const {
    enableSigstore,
    fulcio,
    fulcioOidcClientId,
    fulcioOidcIssuer,
    timestampServers,
    attestations,
    exportLink,
    exportSBOM,
    exportSLSA,
    mavenPOM,
    certificate,
    enableArchivista,
    archivistaServer,
    fulcioToken,
    intermediates,
    key,
    productExcludeGlob,
    productIncludeGlob,
    spiffeSocket,
    step,
    trace,
    outfile
  } = witnessOptions;

  if (enableSigstore) {
    const sigstoreFulcio = fulcio || "https://fulcio.sigstore.dev";
    const sigstoreClientId = fulcioOidcClientId || "sigstore";
    const sigstoreOidcIssuer = fulcioOidcIssuer || "https://oauth2.sigstore.dev/auth";
    let sigstoreTimestampServers = "https://freetsa.org/tsr";
    if (timestampServers) {
      sigstoreTimestampServers += " " + timestampServers;
    }
    cmd.push(`--signer-fulcio-url=${sigstoreFulcio}`);
    cmd.push(`--signer-fulcio-oidc-client-id=${sigstoreClientId}`);
    cmd.push(`--signer-fulcio-oidc-issuer=${sigstoreOidcIssuer}`);
    sigstoreTimestampServers.split(" ").forEach((ts) => {
      ts = ts.trim();
      if (ts.length > 0) {
        cmd.push(`--timestamp-servers=${ts}`);
      }
    });
  } else if (timestampServers) {
    timestampServers.split(" ").forEach((ts) => {
      ts = ts.trim();
      if (ts.length > 0) {
        cmd.push(`--timestamp-servers=${ts}`);
      }
    });
  }
  
  if (attestations && attestations.length) {
    attestations.forEach((attestation) => {
      attestation = attestation.trim();
      if (attestation.length > 0) {
        cmd.push(`-a=${attestation}`);
      }
    });
  }
  
  if (exportLink) cmd.push(`--attestor-link-export`);
  if (exportSBOM) cmd.push(`--attestor-sbom-export`);
  if (exportSLSA) cmd.push(`--attestor-slsa-export`);
  if (mavenPOM) cmd.push(`--attestor-maven-pom-path=${mavenPOM}`);
  
  if (certificate) cmd.push(`--certificate=${certificate}`);
  if (enableArchivista) cmd.push(`--enable-archivista=${enableArchivista}`);
  if (archivistaServer) cmd.push(`--archivista-server=${archivistaServer}`);
  if (fulcioToken) cmd.push(`--signer-fulcio-token=${fulcioToken}`);
  
  if (intermediates && intermediates.length) {
    intermediates.forEach((intermediate) => {
      intermediate = intermediate.trim();
      if (intermediate.length > 0) {
        cmd.push(`-i=${intermediate}`);
      }
    });
  }
  
  if (key) cmd.push(`--key=${key}`);
  if (productExcludeGlob) cmd.push(`--attestor-product-exclude-glob=${productExcludeGlob}`);
  if (productIncludeGlob) cmd.push(`--attestor-product-include-glob=${productIncludeGlob}`);
  if (spiffeSocket) cmd.push(`--spiffe-socket=${spiffeSocket}`);
  if (step) cmd.push(`-s=${step}`);
  if (trace) cmd.push(`--trace=${trace}`);
  if (outfile) cmd.push(`--outfile=${outfile}`);
  
  return [...cmd, "--", ...extraArgs];
}

/**
 * Runs a wrapped GitHub Action using witness.
 * It reads the action's metadata, determines the entry point, and executes it.
 */
async function runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv) {
  const actionYmlPath = getActionYamlPath(actionDir);
  const actionConfig = yaml.load(fs.readFileSync(actionYmlPath, 'utf8'));
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
  core.info(`Running witness command: ${witnessExePath}/witness ${args.join(" ")}`);

  let output = "";
  await exec.exec(`${witnessExePath}/witness`, args, {
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
 * Runs a direct command using witness.
 */
async function runDirectCommandWithWitness(command, witnessOptions, witnessExePath) {
  const commandArray = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [command];
  const args = assembleWitnessArgs(witnessOptions, commandArray);
  core.info(`Running witness command: ${witnessExePath}/witness ${args.join(" ")}`);

  let output = "";
  await exec.exec(`${witnessExePath}/witness`, args, {
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

/**
 * Reads inputs and constructs the witnessOptions object.
 */
function getWitnessOptions() {
  let outfile = core.getInput("outfile");
  const step = core.getInput("step");
  outfile = outfile ? outfile : path.join(os.tmpdir(), `${step}-attestation.json`);
  
  return {
    step,
    archivistaServer: core.getInput("archivista-server"),
    attestations: core.getInput("attestations").split(" "),
    certificate: core.getInput("certificate"),
    enableArchivista: core.getInput("enable-archivista") === "true",
    fulcio: core.getInput("fulcio"),
    fulcioOidcClientId: core.getInput("fulcio-oidc-client-id"),
    fulcioOidcIssuer: core.getInput("fulcio-oidc-issuer"),
    fulcioToken: core.getInput("fulcio-token"),
    intermediates: core.getInput("intermediates").split(" "),
    key: core.getInput("key"),
    outfile,
    productExcludeGlob: core.getInput("product-exclude-glob"),
    productIncludeGlob: core.getInput("product-include-glob"),
    spiffeSocket: core.getInput("spiffe-socket"),
    timestampServers: core.getInput("timestamp-servers"),
    trace: core.getInput("trace"),
    enableSigstore: core.getInput("enable-sigstore") === "true",
    exportLink: core.getInput("attestor-link-export") === "true",
    exportSBOM: core.getInput("attestor-sbom-export") === "true",
    exportSLSA: core.getInput("attestor-slsa-export") === "true",
    mavenPOM: core.getInput("attestor-maven-pom-path"),
  };
}

/**
 * Prepares the environment variables to be passed to a wrapped action.
 * All direct inputs are passed as "passed inputs".
 */
function getWrappedActionEnv() {
  const newEnv = { ...process.env };
  const passedInputs = new Set();

  // Pass all direct inputs that are not part of witness options.
  const witnessInputNames = new Set(
    [
      "witness-install-dir", "archivista-server", "attestations", "attestor-link-export", "attestor-maven-pom-path",
      "attestor-sbom-export", "attestor-slsa-export", "enable-sigstore", "command", "certificate", "enable-archivista",
      "fulcio", "fulcio-oidc-client-id", "fulcio-oidc-issuer", "fulcio-token", "intermediates", "key", "outfile",
      "product-exclude-glob", "product-include-glob", "spiffe-socket", "step", "timestamp-servers", "trace", "version",
      "workingdir", "action-ref"
    ].map(name => name.toLowerCase())
  );

  for (const key in process.env) {
    const match = key.match(/^INPUT_(.+)$/);
    if (match) {
      const inputName = match[1].toLowerCase();
      if (!witnessInputNames.has(inputName) && !passedInputs.has(inputName)) {
        core.info(`Passing direct input to wrapped action: ${inputName}=${process.env[key]}`);
        passedInputs.add(inputName);
      }
    }
  }
  return newEnv;
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

/**
 * Parses the witness output to extract GitOIDs.
 */
function extractDesiredGitOIDs(output) {
  const lines = output.split("\n");
  const desiredSubstring = "Stored in archivista as ";
  const gitOIDs = [];
  console.log("Looking for GitOID in the output");
  for (const line of lines) {
    if (line.indexOf(desiredSubstring) !== -1) {
      console.log("Checking line: ", line);
      const match = line.match(/[0-9a-fA-F]{64}/);
      if (match) {
        console.log("Found GitOID: ", match[0]);
        gitOIDs.push(match[0]);
      }
    }
  }
  return gitOIDs;
}

/**
 * Updates the GitHub Step Summary with the extracted GitOIDs.
 */
function handleGitOIDs(output, archivistaServer, step, attestations) {
  const gitOIDs = extractDesiredGitOIDs(output);
  for (const gitOID of gitOIDs) {
    console.log("Extracted GitOID:", gitOID);
    core.setOutput("git_oid", gitOID);
    const artifactURL = `${archivistaServer}/download/${gitOID}`;
    const summaryHeader = `
## Attestations Created
| Step | Attestors Run | Attestation GitOID
| --- | --- | --- |
`;
    const summaryFile = fs.readFileSync(process.env.GITHUB_STEP_SUMMARY, { encoding: "utf-8" });
    if (!summaryFile.includes(summaryHeader.trim())) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryHeader);
    }
    const tableRow = `| ${step} | ${attestations.join(", ")} | [${gitOID}](${artifactURL}) |\n`;
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, tableRow);
  }
}

/**
 * Main runner: sets up witness, determines whether to run a wrapped action or a direct command,
 * executes it, and handles post-run tasks.
 */
async function run() {
  try {
    const witnessExePath = await downloadAndSetupWitness();
    console.log(`Debug: Final witness executable path: ${witnessExePath}`);

    const witnessOptions = getWitnessOptions();
    const command = core.getInput("command");
    const actionRef = core.getInput("action-ref");

    if (!command && !actionRef) {
      throw new Error("Either 'command' or 'action-ref' input is required");
    }

    // Ensure we run in the GitHub workspace
    process.chdir(process.env.GITHUB_WORKSPACE || process.cwd());
    core.info(`Running in directory ${process.cwd()}`);

    let output = "";
    if (actionRef) {
      core.info(`Wrapping GitHub Action: ${actionRef}`);
      const newEnv = getWrappedActionEnv();
      const actionDir = await downloadAndSetupAction(actionRef);
      output = await runActionWithWitness(actionDir, witnessOptions, witnessExePath, newEnv);
      cleanUpDirectory(actionDir);
    } else if (command) {
      core.info(`Running command: ${command}`);
      output = await runDirectCommandWithWitness(command, witnessOptions, witnessExePath);
    }

    handleGitOIDs(output, witnessOptions.archivistaServer, witnessOptions.step, witnessOptions.attestations);
    process.exit(0);
  } catch (error) {
    core.setFailed(`Witness run action failed: ${error.message}`);
    process.exit(1);
  }
}

run();
