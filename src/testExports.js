/**
 * This file exports internal functions for testing purposes.
 * It should only be imported in test files, not in production code.
 */

// Import functions to expose for testing
const assembleWitnessArgs = require('./attestation/assembleWitnessArgs');
const getWitnessOptions = require('./attestation/getWitnessOptions');
const { detectActionType } = require('./actions/actionUtils');
const { downloadAndSetupWitness } = require('./core/witnessDownloader');

// Export functions for testing
module.exports = {
  assembleWitnessArgs,
  getWitnessOptions,
  detectActionType,
  downloadAndSetupWitness,
};