/**
 * Mock implementation of @actions/exec for testing
 */

const originalModule = jest.requireActual('@actions/exec');

// Store command executions for verification
const executions = [];

// Mock exec implementation
const exec = jest.fn(async (command, args, options) => {
  // Store execution for test verification
  executions.push({
    command,
    args: args || [],
    options: options || {}
  });
  
  // Call any listeners with mock stdout/stderr data
  if (options && options.listeners) {
    if (options.listeners.stdout) {
      options.listeners.stdout(Buffer.from('Mock stdout output\n'));
    }
    if (options.listeners.stderr) {
      options.listeners.stderr(Buffer.from('Mock stderr output\n'));
    }
  }
  
  return 0; // Success exit code
});

// Configure exec to return custom output/error
function setExecCommandOutput(commandPattern, stdout, stderr, exitCode = 0) {
  exec.mockImplementation(async (command, args, options) => {
    // Store execution
    executions.push({
      command,
      args: args || [],
      options: options || {}
    });
    
    const fullCommand = [command, ...(args || [])].join(' ');
    
    // Check if command matches the pattern
    if (fullCommand.match(commandPattern)) {
      // Call listeners with custom output
      if (options && options.listeners) {
        if (options.listeners.stdout && stdout) {
          options.listeners.stdout(Buffer.from(stdout));
        }
        if (options.listeners.stderr && stderr) {
          options.listeners.stderr(Buffer.from(stderr));
        }
      }
      return exitCode;
    }
    
    // Default behavior for non-matching commands
    if (options && options.listeners) {
      if (options.listeners.stdout) {
        options.listeners.stdout(Buffer.from('Default mock stdout\n'));
      }
      if (options.listeners.stderr) {
        options.listeners.stderr(Buffer.from('Default mock stderr\n'));
      }
    }
    
    return 0;
  });
}

// Reset all mocks and stored values
function resetAllMocks() {
  exec.mockClear();
  executions.length = 0;
  
  // Reset to default implementation
  exec.mockImplementation(async (command, args, options) => {
    executions.push({
      command,
      args: args || [],
      options: options || {}
    });
    
    if (options && options.listeners) {
      if (options.listeners.stdout) {
        options.listeners.stdout(Buffer.from('Mock stdout output\n'));
      }
      if (options.listeners.stderr) {
        options.listeners.stderr(Buffer.from('Mock stderr output\n'));
      }
    }
    
    return 0;
  });
}

module.exports = {
  ...originalModule,
  exec,
  executions,
  setExecCommandOutput,
  resetAllMocks
};
