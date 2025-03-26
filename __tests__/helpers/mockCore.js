/**
 * Mock implementation of @actions/core for testing
 */

const originalModule = jest.requireActual('@actions/core');

// Store inputs that can be set in tests
const testInputs = {};

// Store outputs for verification
const testOutputs = {};

// Store failed messages
const failedMessages = [];

// Create mocked functions that track calls
const info = jest.fn();
const warning = jest.fn();
const error = jest.fn();
const debug = jest.fn();
const setFailed = jest.fn((message) => {
  failedMessages.push(message);
});

// Implement getInput to return from testInputs
const getInput = jest.fn((name, options) => {
  const val = testInputs[name] || '';
  if (options && options.required && !val) {
    throw new Error(`Input required and not supplied: ${name}`);
  }
  return val;
});

// Implement setOutput to store in testOutputs
const setOutput = jest.fn((name, value) => {
  testOutputs[name] = value;
});

// Add path to environment
const addPath = jest.fn((path) => {
  // Simulate adding to PATH
  process.env.PATH = `${path}${process.env.PATH ? ':' + process.env.PATH : ''}`;
});

// Reset all mocks and stored values
function resetAllMocks() {
  info.mockClear();
  warning.mockClear();
  error.mockClear();
  debug.mockClear();
  setFailed.mockClear();
  getInput.mockClear();
  setOutput.mockClear();
  addPath.mockClear();
  
  Object.keys(testInputs).forEach(key => delete testInputs[key]);
  Object.keys(testOutputs).forEach(key => delete testOutputs[key]);
  failedMessages.length = 0;
}

// Helper to set inputs for testing
function setInput(name, value) {
  testInputs[name] = value;
  
  // Also set environment variable format for completeness
  process.env[`INPUT_${name.replace(/-/g, '_').toUpperCase()}`] = value;
}

// Helper to set multiple inputs at once
function setInputs(inputObj) {
  Object.entries(inputObj).forEach(([name, value]) => {
    setInput(name, value);
  });
}

module.exports = {
  ...originalModule,
  info,
  warning,
  error,
  debug,
  setFailed,
  getInput,
  setOutput,
  addPath,
  resetAllMocks,
  setInput,
  setInputs,
  testInputs,
  testOutputs,
  failedMessages,
};
