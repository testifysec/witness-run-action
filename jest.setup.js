// Set NODE_ENV to 'test' before requiring the main module
process.env.NODE_ENV = 'test';

// Mock process.exit
const originalExit = process.exit;
process.exit = jest.fn((code) => {
  console.log(`Process.exit called with code: ${code}`);
});

// Store original process.exit for restoration if needed
process.realExit = originalExit;