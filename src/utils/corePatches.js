/**
 * Patches for the @actions/core module to filter out unwanted warning messages
 * in certain scenarios like tests or known issues.
 */
const core = require('@actions/core');

// Save the original warning function
const originalWarning = core.warning;

// Patterns to suppress in warnings
const SUPPRESSED_PATTERNS = [
  /Unexpected input\(s\)/,
  /failed to create kms signer: no kms provider found for key reference/,
  /failed to create vault signer: url is a required option/
];

/**
 * Patched warning function that filters out specific patterns
 */
function patchedWarning(message, properties = {}) {
  // Check if message matches any of the patterns to suppress
  const shouldSuppress = SUPPRESSED_PATTERNS.some(pattern => 
    typeof message === 'string' && pattern.test(message)
  );
  
  // If it doesn't match any suppression pattern, pass through to original
  if (!shouldSuppress) {
    originalWarning(message, properties);
  } else {
    // For suppressed warnings, use debug level instead
    core.debug(`Suppressed warning: ${message}`);
  }
}

/**
 * Applies the core warning patch
 */
function applyCorePatch() {
  core.warning = patchedWarning;
}

/**
 * Restores the original warning function
 */
function restoreCore() {
  core.warning = originalWarning;
}

module.exports = {
  applyCorePatch,
  restoreCore
};