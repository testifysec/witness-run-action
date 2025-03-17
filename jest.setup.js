// Set NODE_ENV to 'test' before requiring the main module
process.env.NODE_ENV = 'test';

// Mock process.exit to prevent tests from exiting
const originalExit = process.exit;
process.exit = jest.fn((code) => {
  console.log(`Process.exit called with code: ${code}`);
  // Don't actually exit during tests
});

// Mock console.log to prevent unnecessary output during tests
const originalConsoleLog = console.log;
console.log = jest.fn();

// Store original methods for restoration if needed
process.realExit = originalExit;
console.realLog = originalConsoleLog;