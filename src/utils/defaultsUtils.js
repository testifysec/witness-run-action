/**
 * Utilities for handling default values in a consistent way.
 * This centralizes the logic for merging default values from action.yml files.
 */
const core = require('@actions/core');
const { parseYamlBoolean } = require('./booleanUtils');
const { getEnvKey, setInputValue, hasInputValue } = require('./envUtils');

/**
 * Apply default values from an action.yml file to the environment.
 * This ensures default values are consistently applied when not provided by the user.
 * 
 * @param {Object} env - The environment variables object to modify
 * @param {Object} inputs - The inputs section from action.yml
 * @param {Set} ignoredInputs - Optional set of input names to ignore (e.g., witness-specific inputs)
 * @returns {Array} List of applied default inputs
 */
function applyDefaultsFromActionYml(env, inputs, ignoredInputs = new Set()) {
  if (!inputs) return [];
  
  const appliedDefaults = [];
  
  for (const [inputName, inputConfig] of Object.entries(inputs)) {
    // Skip ignored inputs
    if (ignoredInputs.has(inputName)) continue;
    
    // Only apply default if not already provided
    if (inputConfig.default !== undefined && !hasInputValue(env, inputName)) {
      let defaultValue;
      
      // Handle different types of defaults
      if (typeof inputConfig.default === 'boolean') {
        // Convert boolean to string 'true' or 'false' (lowercase only)
        defaultValue = inputConfig.default ? 'true' : 'false';
        core.info(`Applied boolean default: ${inputName}=${defaultValue} (original type: boolean)`);
      } else {
        // Convert other values to strings
        defaultValue = String(inputConfig.default);
        core.info(`Applied default: ${inputName}=${defaultValue} (original type: ${typeof inputConfig.default})`);
      }
      
      // Set the environment variable
      setInputValue(env, inputName, defaultValue);
      appliedDefaults.push(inputName);
    }
    // Warn about missing required inputs
    else if (inputConfig.required === true && !hasInputValue(env, inputName)) {
      core.warning(`Required input '${inputName}' was not provided`);
    }
  }
  
  return appliedDefaults;
}

/**
 * Checks if a required input is present, warning or throwing an error as needed.
 * 
 * @param {Object} env - The environment variables object to check
 * @param {string} inputName - The name of the input to check
 * @param {Object} options - Options object
 * @param {boolean} options.errorOnMissing - Whether to throw an error if input is missing
 * @returns {boolean} True if input is present, false otherwise
 */
function checkRequiredInput(env, inputName, { errorOnMissing = false } = {}) {
  if (!hasInputValue(env, inputName)) {
    const message = `Required input '${inputName}' was not provided`;
    
    if (errorOnMissing) {
      throw new Error(message);
    } else {
      core.warning(message);
      return false;
    }
  }
  
  return true;
}

module.exports = {
  applyDefaultsFromActionYml,
  checkRequiredInput
};