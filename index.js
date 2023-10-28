//index.js
const core = require("@actions/core");
const exec = require("@actions/exec");
const { exit } = require("process");
const process = require("process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require('axios');
const crypto = require('crypto');
const tar = require('tar');
/**
 * This function downloads and verifies the latest version of Witness.
 * It determines the architecture of the system and the OS, constructs the filename and download URL,
 * gets the expected checksum, downloads the binary, calculates the actual checksum,
 * compares the actual checksum with the expected one, saves the binary to a file in the root directory,
 * extracts the tar.gz file and deletes the tar.gz file.
 * @throws {Error} If the architecture is unsupported or the SHA-256 checksums do not match.
 */

async function downloadAndVerifyWitness() {
  // Get the latest version of Witness
  const { data } = await axios.get('https://api.github.com/repos/testifysec/witness/releases/latest');
  const version = data.tag_name.slice(1); // Remove 'v' prefix

  // Determine the architecture of the system
  let arch = os.arch();
  if (arch === 'x64') {
    arch = 'amd64';
  } else if (arch === 'arm64') {
    arch = 'arm64';
  } else {
    throw new Error('Unsupported architecture');
  }

  // Determine the OS
  const osType = os.type().toLowerCase();

  // Construct the filename and download URL
  const filename = `witness_${version}_${osType}_${arch}.tar.gz`;
  const downloadUrl = `https://github.com/testifysec/witness/releases/download/v${version}/${filename}`;

  console.log(`Downloading ${filename} from ${downloadUrl}`);
  // Get the expected checksum
  const checksumsResponse = await axios.get(`https://github.com/testifysec/witness/releases/download/v${version}/witness_${version}_checksums.txt`);
  const checksums = checksumsResponse.data.split('\n');
  const expectedChecksum = checksums.find(line => line.includes(filename)).split(' ')[0];

  // Download the binary
  const { data: binary } = await axios.get(downloadUrl, { responseType: 'arraybuffer' });

  // Calculate the actual checksum
  const hash = crypto.createHash('sha256');
  hash.update(binary);
  const actualChecksum = hash.digest('hex');

  // Compare the actual checksum with the expected one
  if (actualChecksum !== expectedChecksum) {
    throw new Error('SHA-256 checksums do not match');
  }

  // Save the binary to a file in the root directory
  const filePath = path.join(process.env.GITHUB_WORKSPACE, 'witness.tar.gz');
  await fs.promises.writeFile(filePath, binary);

  console.log('Extracting binary');
  // Extract the tar.gz file
  await tar.x({ file: filePath, C: process.env.GITHUB_WORKSPACE });

  // Delete the tar.gz file
  await fs.promises.unlink(filePath);

  // Add the directory of the binary to the system's PATH
  process.env.PATH = `${path.dirname(filePath)}:${process.env.PATH}`;

  // Set the permissions of the file to 755
  const extractedFilePath = path.join(process.env.GITHUB_WORKSPACE, 'witness');
  console.log(`Setting permissions of ${extractedFilePath} to 755`);
  await fs.promises.chmod(extractedFilePath, '755');
  // Exec the witness with a `witness version` and print the output
  console.log('Executing witness version');
  let output = '';
  const options = {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
    },
  };
  await exec.exec('witness version', [], options);
  console.log(output);
}
/**
 * This function is used to install the dependencies required for the project.
 * It uses the 'npm ci' command to install the dependencies.
 * If there is an error during the installation, it will be caught and the error message will be set as the failure message.
 */

async function installDependencies() {
  try {
    await exec.exec('npm ci');
  } catch (error) {
    core.setFailed(error.message);
  }
}
module.exports = {
  run,
  installDependencies,
  downloadAndVerifyWitness
};
async function run() {
  const step = core.getInput("step");
  const archivistaServer = core.getInput("archivista-server");
  const attestations = core.getInput("attestations").split(" ");
  const certificate = core.getInput("certificate");
  const enableArchivista = core.getInput("enable-archivista") === "true";
  let fulcio = core.getInput("fulcio");
  let fulcioOidcClientId = core.getInput("fulcio-oidc-client-id");
  let fulcioOidcIssuer = core.getInput("fulcio-oidc-issuer");
  const fulcioToken = core.getInput("fulcio-token");
  const intermediates = core.getInput("intermediates").split(" ");
  const key = core.getInput("key");
  let outfile = core.getInput("outfile");
  outfile = outfile
    ? outfile
    : path.join(os.tmpdir(), step + "-attestation.json");
  const productExcludeGlob = core.getInput("product-exclude-glob");
  const productIncludeGlob = core.getInput("product-include-glob");
  const spiffeSocket = core.getInput("spiffe-socket");

  let timestampServers = core.getInput("timestamp-servers");
  const trace = core.getInput("trace");
  const workingdir = core.getInput("workingdir");
  const enableSigstore = core.getInput("enable-sigstore") === "true";
  const command = core.getInput("command");

  const cmd = ["run"];

  if (enableSigstore) {
    fulcio = fulcio || "https://fulcio.sigstore.dev";
    fulcioOidcClientId =
      fulcioOidcClientId || "https://oauth2.sigstore.dev/auth";
    fulcioOidcIssuer = fulcioOidcIssuer || "sigstore";
    timestampServers = "https://freetsa.org/tsr " + timestampServers;
  }

  if (attestations.length) {
    attestations.forEach((attestation) => {
      attestation = attestation.trim();
      if (attestation.length > 0) {
        cmd.push(`-a=${attestation}`);
      }
    });
  }

  if (certificate) cmd.push(`--certificate=${certificate}`);
  if (enableArchivista) cmd.push(`--enable-archivista=${enableArchivista}`);
  if (fulcio) cmd.push(`--fulcio=${fulcio}`);
  if (fulcioOidcClientId)
    cmd.push(`--fulcio-oidc-client-id=${fulcioOidcClientId}`);
  if (fulcioOidcIssuer) cmd.push(`--fulcio-oidc-issuer=${fulcioOidcIssuer}`);
  if (fulcioToken) cmd.push(`--fulcio-token=${fulcioToken}`);

  if (intermediates.length) {
    intermediates.forEach((intermediate) => {
      intermediate = intermediate.trim();
      if (intermediate.length > 0) {
        cmd.push(`-i=${intermediate}`);
      }
    });
  }

  if (key) cmd.push(`--key=${key}`);
  if (productExcludeGlob)
    cmd.push(`--product-excludeGlob=${productExcludeGlob}`);
  if (productIncludeGlob)
    cmd.push(`--product-includeGlob=${productIncludeGlob}`);
  if (spiffeSocket) cmd.push(`--spiffe-socket=${spiffeSocket}`);
  if (step) cmd.push(`-s=${step}`);

  if (timestampServers) {
    const timestampServerValues = timestampServers.split(" ");
    timestampServerValues.forEach((timestampServer) => {
      timestampServer = timestampServer.trim();
      if (timestampServer.length > 0) {
        cmd.push(`--timestamp-servers=${timestampServer}`);
      }
    });
  }

  if (trace) cmd.push(`--trace=${trace}`);
  cmd.push(`--outfile=${outfile}`);
  core.info("Running in directory " + process.env.GITHUB_WORKSPACE);

  process.env.PATH = `${__dirname}:${process.env.PATH}`;
  process.env.PATH = `${process.env.PATH}:/bin:/usr/bin`;

  // Change working directory to the root of the repo
  process.chdir(process.env.GITHUB_WORKSPACE);

  const commandArray = command.match(/(?:[^\s"]+|"[^"]*")+/g);

  // Execute the command and capture its output
  const runArray = ["witness", ...cmd, "--", ...commandArray],
    commandString = runArray.join(" ");

  let output = "";
  await exec.exec("sh", ["-c", commandString], {
    cwd: process.cwd(),
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

  // Find the Git OID from the output
  const gitOID = extractDesiredGitOID(output);
  console.log("Extracted Git OID:", gitOID);

  // Print the Git OID to the output
  core.setOutput("git_oid", gitOID);

  // Construct the artifact URL using Archivista server and Git OID
  const artifactURL = `${archivistaServer}/download/${gitOID}`;

  // Add Job Summary with Markdown content
  const summaryHeader = `
## Attestations Created
| Step | Attestors Run | Attentation OID
| --- | --- | --- |
`;

  // Read the contents of the file
  const summaryFile = fs.readFileSync(process.env.GITHUB_STEP_SUMMARY, {
    encoding: "utf-8",
  });

  // Check if the file contains the header
  const headerExists = summaryFile.includes(summaryHeader.trim());

  // If the header does not exist, append it to the file
  if (!headerExists) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryHeader);
  }

  // Construct the table row for the current step
  const tableRow = `| ${step} | ${attestations.join(
    ", "
  )} | [${gitOID}](${artifactURL}) |\n`;

  // Append the table row to the file
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, tableRow);

  exit(0);
}

function extractDesiredGitOID(output) {
  const lines = output.split("\n");
  const desiredSubstring = "Stored in archivist as ";

  for (const line of lines) {
    const startIndex = line.indexOf(desiredSubstring);
    if (startIndex !== -1) {
      const match = line.match(/[0-9a-fA-F]{64}/);
      if (match) {
        return match[0];
      }
    }
  }
}
// This is to avoid running the code in the test environment
if (process.env.NODE_ENV !== 'test') {
  run();
}