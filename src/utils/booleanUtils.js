/**
 * Utilities for handling boolean values according to YAML 1.2 Core Schema.
 */

/**
 * YAML 1.2 Core Schema true values: true, True, TRUE, y, Y, yes, Yes, YES, on, On, ON
 * YAML 1.2 Core Schema false values: false, False, FALSE, n, N, no, No, NO, off, Off, OFF
 */
const YAML_TRUE_VALUES = new Set([
  'true', 'True', 'TRUE',
  'y', 'Y', 'yes', 'Yes', 'YES',
  'on', 'On', 'ON'
]);

const YAML_FALSE_VALUES = new Set([
  'false', 'False', 'FALSE',
  'n', 'N', 'no', 'No', 'NO',
  'off', 'Off', 'OFF'
]);

/**
 * Validates if a string is a valid YAML 1.2 Core Schema boolean.
 * 
 * @param {string} value - The value to check
 * @param {Object} options - Options object
 * @param {boolean} options.trim - Whether to trim whitespace (default: true)
 * @returns {boolean} True if the value is a valid YAML boolean, false otherwise
 */
function isValidYamlBoolean(value, { trim = true } = {}) {
  if (typeof value !== 'string') return false;
  
  // Trim if requested
  const processedValue = trim ? value.trim() : value;
  return YAML_TRUE_VALUES.has(processedValue) || YAML_FALSE_VALUES.has(processedValue);
}

/**
 * Converts a value to a boolean according to YAML 1.2 Core Schema.
 * Trims whitespace from the value before parsing.
 * 
 * @param {string} value - The value to convert
 * @param {Object} options - Options object
 * @param {boolean} options.trim - Whether to trim whitespace (default: true)
 * @returns {boolean|null} The boolean value, or null if invalid
 */
function parseYamlBoolean(value, { trim = true } = {}) {
  if (typeof value !== 'string') return null;
  
  // Trim if requested
  const processedValue = trim ? value.trim() : value;
  
  if (YAML_TRUE_VALUES.has(processedValue)) {
    return true;
  } else if (YAML_FALSE_VALUES.has(processedValue)) {
    return false;
  }
  
  return null;
}

/**
 * Validates and returns a boolean value from input.
 * Similar to GitHub's core.getBooleanInput but preserves the original format.
 * Trims whitespace from the value before validating.
 * 
 * @param {string} value - The value to validate
 * @param {Object} options - Options object
 * @param {boolean} options.required - Whether the input is required
 * @param {boolean} options.trim - Whether to trim whitespace (default: true)
 * @returns {string|null} The validated boolean string or null if invalid
 * @throws {Error} If the value is not a valid YAML boolean and options.required is true
 */
function validateBooleanInput(value, { required = false, trim = true } = {}) {
  // Handle undefined, null, or empty string
  if (!value && value !== false) {
    if (required) {
      throw new Error('Required boolean input is empty or not provided');
    }
    return null;
  }
  
  // Convert to string if it's actually a boolean
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  
  // Validate string value
  if (typeof value === 'string') {
    // Trim the value if requested
    const processedValue = trim ? value.trim() : value;
    
    if (isValidYamlBoolean(processedValue, { trim: false })) {
      return processedValue; // Return the processed string to preserve the format
    }
  }
  
  // If we get here, the value is not a valid YAML boolean
  if (required) {
    throw new Error(`Input does not meet YAML 1.2 'Core Schema' specification: ${value}\nSupport boolean input list: true | True | TRUE | false | False | FALSE | y | Y | yes | Yes | YES | n | N | no | No | NO | on | On | ON | off | Off | OFF`);
  }
  
  return null;
}

module.exports = {
  isValidYamlBoolean,
  parseYamlBoolean,
  validateBooleanInput,
  YAML_TRUE_VALUES,
  YAML_FALSE_VALUES
};