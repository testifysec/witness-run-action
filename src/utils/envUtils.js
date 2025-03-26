/**
 * Utilities for handling environment variables in a consistent way.
 * This centralizes the logic for managing GitHub Actions environment variables.
 */

/**
 * Normalizes an input name to the GitHub environment variable format.
 * According to GitHub Actions behavior:
 * - Spaces are replaced with underscores
 * - The resulting string is converted to uppercase
 * - Hyphens are preserved (not converted)
 * 
 * @param {string} inputName - The name of the input parameter
 * @returns {string} The environment variable key in the format INPUT_NAME-WITH-HYPHENS
 */
function getEnvKey(inputName) {
  // GitHub Actions uppercases the name and replaces spaces with underscores, but preserves hyphens
  return `INPUT_${inputName.replace(/ /g, '_').toUpperCase()}`;
}

/**
 * Gets the value of an input from environment variables.
 * Trims whitespace from the value before returning.
 * 
 * @param {Object} env - The environment variables object to use
 * @param {string} inputName - The name of the input to retrieve
 * @param {Object} options - Options object
 * @param {boolean} options.trim - Whether to trim whitespace (default: true)
 * @returns {string|undefined} The input value or undefined if not present
 */
function getInputValue(env, inputName, { trim = true } = {}) {
  const key = getEnvKey(inputName);
  const value = env[key];
  
  if (value === undefined) {
    return undefined;
  }
  
  return trim ? value.trim() : value;
}

/**
 * Sets an input value in the environment variables.
 * Trims whitespace from the value before setting.
 * 
 * @param {Object} env - The environment variables object to modify
 * @param {string} inputName - The name of the input to set
 * @param {string} value - The value to set
 * @param {Object} options - Options object
 * @param {boolean} options.trim - Whether to trim whitespace (default: true)
 */
function setInputValue(env, inputName, value, { trim = true } = {}) {
  const key = getEnvKey(inputName);
  
  // Convert to string and trim if needed
  const stringValue = typeof value === 'string' ? value : String(value);
  env[key] = trim ? stringValue.trim() : stringValue;
}

/**
 * Checks if an input is defined in the environment variables.
 * 
 * @param {Object} env - The environment variables object to check
 * @param {string} inputName - The name of the input to check
 * @returns {boolean} True if the input is defined, false otherwise
 */
function hasInputValue(env, inputName) {
  const key = getEnvKey(inputName);
  return key in env;
}

module.exports = {
  getEnvKey,
  getInputValue,
  setInputValue,
  hasInputValue
};