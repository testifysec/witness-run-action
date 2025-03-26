/**
 * Utilities for working with GitOIDs from witness output
 */
const fs = require('fs');
const core = require('@actions/core');

/**
 * Parses the witness output to extract GitOIDs.
 */
function extractDesiredGitOIDs(output) {
  const lines = output.split("\n");
  const desiredSubstring = "Stored in archivista as ";
  const gitOIDs = [];
  core.debug("Looking for GitOID in the output");
  for (const line of lines) {
    if (line.indexOf(desiredSubstring) !== -1) {
      core.debug(`Checking line containing Archivista reference`);
      const match = line.match(/[0-9a-fA-F]{64}/);
      if (match) {
        core.debug(`Found GitOID: ${match[0]}`);
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
    core.info(`Attestation created with ID: ${gitOID}`);
    core.setOutput("git_oid", gitOID);
    
    // Update step summary only if GITHUB_STEP_SUMMARY environment variable is set
    if (process.env.GITHUB_STEP_SUMMARY) {
      const artifactURL = `${archivistaServer}/download/${gitOID}`;
      const summaryHeader = `
## Attestations Created
| Step | Attestors Run | Attestation GitOID
| --- | --- | --- |
`;
      try {
        const summaryFile = fs.readFileSync(process.env.GITHUB_STEP_SUMMARY, { encoding: "utf-8" });
        if (!summaryFile.includes(summaryHeader.trim())) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryHeader);
        }
        const tableRow = `| ${step} | ${attestations.join(", ")} | [${gitOID}](${artifactURL}) |\n`;
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, tableRow);
        core.debug(`Added attestation details to GitHub step summary`);
      } catch (error) {
        core.warning(`Failed to update GitHub step summary: ${error.message}`);
      }
    } else {
      core.debug("GITHUB_STEP_SUMMARY environment variable not set, skipping step summary update");
    }
  }
}

module.exports = {
  extractDesiredGitOIDs,
  handleGitOIDs
};