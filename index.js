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
 * Detects the type of GitHub Action based on its metadata.
 * @param {Object} actionConfig - The parsed action.yml config object
 * @returns {string} - The action type: 'javascript', 'docker', or 'composite'
 */
function detectActionType(actionConfig) {
  if (!actionConfig.runs) {
    throw new Error('Invalid action metadata: missing "runs" section');
  }

  const using = actionConfig.runs.using;
  
  if (using === 'node16' || using === 'node20' || using === 'node12') {
    return 'javascript';
  } else if (using === 'docker') {
    return 'docker';
  } else if (using === 'composite') {
    return 'composite';
  } else {
    return 'unknown';
  }
}

/**
 * Runs a wrapped GitHub Action using witness.
 * It reads the action's metadata, determines the type, and executes it with the appropriate handler.
 */
async function runActionWithWitness(actionDir, witnessOptions, witnessExePath, actionEnv) {
  const actionYmlPath = getActionYamlPath(actionDir);
  const actionConfig = yaml.load(fs.readFileSync(actionYmlPath, 'utf8'));
  
  const actionType = detectActionType(actionConfig);
  core.info(`Detected action type: ${actionType}`);
  
  switch (actionType) {
    case 'javascript':
      return await runJsActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv);
    case 'docker':
      throw new Error('Docker-based actions are not yet supported');
    case 'composite':
      return await runCompositeActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, actionEnv);
    default:
      throw new Error(`Unsupported action type: ${actionType}`);
  }
}

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
 * Executes a shell command step from a composite action
 */
async function executeCompositeShellStep(step, actionDir, witnessOptions, witnessExePath, env, actionConfig) {
  if (!step.run) {
    throw new Error('Invalid shell step: missing run command');
  }
  
  // Process the script content to replace GitHub expressions before execution
  let scriptContent = step.run;
  
  // Replace common GitHub expressions
  scriptContent = scriptContent.replace(/\$\{\{\s*github\.action_path\s*\}\}/g, actionDir);
  
  // Replace inputs expressions
  scriptContent = scriptContent.replace(/\$\{\{\s*inputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, inputName) => {
    const normalizedName = inputName.replace(/-/g, '_').toUpperCase();
    const envVarName = `INPUT_${normalizedName}`;
    if (env[envVarName]) {
      return env[envVarName];
    }
    // Try to find a default in the action config
    if (actionConfig.inputs && actionConfig.inputs[inputName] && actionConfig.inputs[inputName].default) {
      return actionConfig.inputs[inputName].default;
    }
    return '';
  });
  
  // Replace step outputs expressions
  scriptContent = scriptContent.replace(/\$\{\{\s*steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, stepId, outputName) => {
    const envVarName = `STEPS_${stepId.toUpperCase()}_OUTPUTS_${outputName.toUpperCase()}`;
    return env[envVarName] || '';
  });
  
  // Special handling for adding action directory to PATH
  // If the script adds an entry to GITHUB_PATH, directly modify PATH for subsequent steps
  if (scriptContent.includes('GITHUB_PATH') && scriptContent.includes('>>')) {
    // For this specific case where adding to GITHUB_PATH, set the PATH for all subsequent steps
    if (scriptContent.includes(actionDir)) {
      core.info(`Detected PATH update to include action directory: ${actionDir}`);
      // Add the action directory to PATH environment variable for subsequent steps
      env.PATH = `${actionDir}:${env.PATH || ''}`;
    }
  }
  
  // Create a temporary script file with the processed content
  const scriptPath = path.join(os.tmpdir(), `witness-step-${Date.now()}.sh`);
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  
  core.info(`Executing composite shell step in directory: ${actionDir}`);
  core.info(`Created temporary script at: ${scriptPath}`);
  
  // Log the processed script content for debugging
  core.info(`Script content after processing expressions:`);
  core.info(`---BEGIN SCRIPT---`);
  core.info(scriptContent);
  core.info(`---END SCRIPT---`);
  
  // For commands that might need executables from the action directory,
  // we need to ensure the action directory is in the PATH
  if (!env.PATH) {
    env.PATH = process.env.PATH || '';
  }
  
  // Ensure action directory is in PATH
  if (!env.PATH.includes(actionDir)) {
    core.info(`Adding action directory to PATH: ${actionDir}`);
    env.PATH = `${actionDir}:${env.PATH}`;
  }
  
  // Use bash to execute the script directly
  const shellCommand = `bash -e ${scriptPath}`;
  
  // Use our existing command runner to execute the shell command with the right environment
  const commandArray = shellCommand.match(/(?:[^\s"]+|"[^"]*")+/g) || [shellCommand];
  const args = assembleWitnessArgs(witnessOptions, commandArray);
  core.info(`Running witness command: ${witnessExePath}/witness ${args.join(" ")}`);

  let output = "";
  try {
    await exec.exec(`${witnessExePath}/witness`, args, {
      cwd: actionDir,  // Use the action directory as working directory
      env: env,        // Pass the step environment variables
      listeners: {
        stdout: (data) => {
          output += data.toString();
        },
        stderr: (data) => {
          output += data.toString();
        },
      },
    });
  } finally {
    // Clean up the temporary script file
    try {
      fs.unlinkSync(scriptPath);
    } catch (error) {
      core.warning(`Failed to clean up temporary script: ${error.message}`);
    }
  }
  
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
 * Executes a 'uses' step from a composite action
 * Handles both local and GitHub-hosted actions referenced by the 'uses' keyword.
 */
async function executeCompositeUsesStep(step, parentActionDir, witnessOptions, witnessExePath, parentEnv, stepOutputs) {
  if (!step.uses) {
    throw new Error('Invalid uses step: missing uses reference');
  }

  core.info(`Executing 'uses' step: ${step.uses}`);
  
  // Prepare environment for the nested action
  const nestedEnv = { ...parentEnv };
  
  // Process any 'with' inputs for the nested action
  if (step.with) {
    core.info(`Processing 'with' inputs for nested action`);
    for (const [inputName, inputValue] of Object.entries(step.with)) {
      // Process expressions in the input value if it's a string
      let processedValue = inputValue;
      if (typeof inputValue === 'string') {
        // Handle expressions like ${{ steps.previous-step.outputs.output-name }}
        processedValue = inputValue.replace(/\$\{\{\s*steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\s*\}\}/g, (match, stepId, outputName) => {
          const key = `steps.${stepId}.outputs.${outputName}`;
          return stepOutputs[key] || '';
        });
      }
      
      const inputKey = `INPUT_${inputName.replace(/-/g, '_').toUpperCase()}`;
      nestedEnv[inputKey] = processedValue;
      core.info(`Setting nested action input: ${inputName}=${processedValue}`);
    }
  }
  
  // Determine action type and resolve location
  let actionDir;
  let actionReference = step.uses;
  
  // Handle local action reference (./ format)
  if (actionReference.startsWith('./')) {
    core.info(`Resolving local action reference: ${actionReference}`);
    
    // Adjust path to be relative to the parent action
    actionDir = path.resolve(parentActionDir, actionReference);
    core.info(`Resolved local action directory: ${actionDir}`);
  } 
  // Handle GitHub-hosted action (owner/repo@ref format)
  else if (actionReference.includes('@')) {
    core.info(`Downloading GitHub-hosted action: ${actionReference}`);
    actionDir = await downloadAndSetupAction(actionReference);
    core.info(`Downloaded GitHub action to: ${actionDir}`);
  } 
  // Handle action reference without explicit ref (defaults to latest)
  else if (actionReference.includes('/')) {
    core.info(`Downloading GitHub-hosted action with implicit ref: ${actionReference}@main`);
    actionDir = await downloadAndSetupAction(`${actionReference}@main`);
    core.info(`Downloaded GitHub action to: ${actionDir}`);
  } 
  else {
    throw new Error(`Unsupported action reference format: ${actionReference}`);
  }
  
  try {
    // Get action metadata
    const actionYmlPath = getActionYamlPath(actionDir);
    const actionConfig = yaml.load(fs.readFileSync(actionYmlPath, 'utf8'));
    
    // Detect action type
    const actionType = detectActionType(actionConfig);
    core.info(`Nested action type: ${actionType}`);
    
    // Execute the action based on its type
    let output = "";
    
    switch (actionType) {
      case 'javascript':
        output = await runJsActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, nestedEnv);
        break;
      case 'composite':
        output = await runCompositeActionWithWitness(actionDir, actionConfig, witnessOptions, witnessExePath, nestedEnv);
        break;
      case 'docker':
        throw new Error('Docker-based actions are not yet supported in nested actions');
      default:
        throw new Error(`Unsupported nested action type: ${actionType}`);
    }
    
    // Process action outputs if defined
    if (actionConfig.outputs) {
      core.info('Processing nested action outputs');
      for (const [outputName, outputConfig] of Object.entries(actionConfig.outputs)) {
        // Extract the value from the expression
        if (outputConfig.value && typeof outputConfig.value === 'string') {
          const valueMatch = outputConfig.value.match(/\$\{\{\s*steps\.([^.]+)\.outputs\.([^}]+)\s*\}\}/);
          if (valueMatch) {
            const [_, stepId, stepOutputName] = valueMatch;
            const key = `steps.${stepId}.outputs.${stepOutputName}`;
            
            // Access the output from the nested action's step outputs
            const outputValue = stepOutputs[key] || '';
            
            // Make this output available to the parent action using a special format
            const nestedOutputKey = `NESTED_ACTION_OUTPUT_${outputName.replace(/-/g, '_').toUpperCase()}`;
            parentEnv[nestedOutputKey] = outputValue;
            
            // Add to the step.id.outputs map if the current step has an ID
            if (step.id) {
              stepOutputs[`steps.${step.id}.outputs.${outputName}`] = outputValue;
              core.info(`Propagated nested action output: ${outputName}=${outputValue}`);
            }
          }
        }
      }
    }
    
    return output;
  } finally {
    // Clean up if this was a downloaded action (not a local reference)
    if (!actionReference.startsWith('./')) {
      cleanUpDirectory(actionDir);
    }
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
