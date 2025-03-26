/**
 * Utility functions for working with GitHub Actions
 */
const fs = require('fs');
const path = require('path');

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

module.exports = {
  detectActionType,
  getActionYamlPath
};