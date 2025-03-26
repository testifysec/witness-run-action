/**
 * Main entry point for the witness-run-action
 */
const WitnessActionRunner = require('./runners/WitnessActionRunner');

// Expose a main runner function
async function run() {
  const runner = new WitnessActionRunner();
  await runner.run();
}

// Export test functions if in test environment
if (process.env.NODE_ENV === 'test') {
  const testExports = require('./testExports');
  module.exports = {
    run,
    __TEST__: testExports
  };
} else {
  module.exports = { run };
}

// Execute if this is the main module
if (require.main === module) {
  run();
}