/**
 * Mock implementation of fs module for testing
 */

const mockFs = require('mock-fs');
const path = require('path');

// Store file system records for verification
const fileSystem = {
  files: {},
  directories: {}
};

// Mock implementations
const existsSync = jest.fn((filePath) => {
  // Use the mock-fs function or return a custom result
  try {
    return require('fs').existsSync(filePath);
  } catch (err) {
    // If mock-fs is not initialized, provide a fallback behavior
    return Object.prototype.hasOwnProperty.call(fileSystem.files, filePath) || 
           Object.prototype.hasOwnProperty.call(fileSystem.directories, filePath);
  }
});

const readFileSync = jest.fn((filePath, options) => {
  // Use the mock-fs function or return custom content
  try {
    return require('fs').readFileSync(filePath, options);
  } catch (err) {
    if (Object.prototype.hasOwnProperty.call(fileSystem.files, filePath)) {
      if (options === 'utf8' || (options && options.encoding === 'utf8')) {
        return fileSystem.files[filePath];
      }
      return Buffer.from(fileSystem.files[filePath]);
    }
    throw new Error(`File not found: ${filePath}`);
  }
});

const writeFileSync = jest.fn((filePath, content, options) => {
  // Record the file write
  fileSystem.files[filePath] = content.toString();
  
  // Use the mock-fs function if available
  try {
    return require('fs').writeFileSync(filePath, content, options);
  } catch (err) {
    // Silently succeed if mock-fs not initialized
    return undefined;
  }
});

const mkdirSync = jest.fn((dirPath, options) => {
  // Record the directory creation
  fileSystem.directories[dirPath] = true;
  
  // Use the mock-fs function if available
  try {
    return require('fs').mkdirSync(dirPath, options);
  } catch (err) {
    // Silently succeed if mock-fs not initialized
    return undefined;
  }
});

const rmdirSync = jest.fn((dirPath, options) => {
  // Record the directory removal
  delete fileSystem.directories[dirPath];
  
  // Also remove any files in this directory
  Object.keys(fileSystem.files).forEach(filePath => {
    if (filePath.startsWith(dirPath + path.sep)) {
      delete fileSystem.files[filePath];
    }
  });
  
  // Use the mock-fs function if available
  try {
    return require('fs').rmdirSync(dirPath, options);
  } catch (err) {
    // Silently succeed if mock-fs not initialized
    return undefined;
  }
});

const unlinkSync = jest.fn((filePath) => {
  // Record the file deletion
  delete fileSystem.files[filePath];
  
  // Use the mock-fs function if available
  try {
    return require('fs').unlinkSync(filePath);
  } catch (err) {
    // Silently succeed if mock-fs not initialized
    return undefined;
  }
});

const chmodSync = jest.fn((filePath, mode) => {
  // Record the chmod operation
  if (Object.prototype.hasOwnProperty.call(fileSystem.files, filePath)) {
    // We don't actually track file modes in our simple mock
  }
  
  // Use the mock-fs function if available
  try {
    return require('fs').chmodSync(filePath, mode);
  } catch (err) {
    // Silently succeed if mock-fs not initialized
    return undefined;
  }
});

// Helper to mock the file system
function mockFilesystem(mockConfig) {
  // Reset our tracking
  resetAllMocks();
  
  // Configure mock-fs
  mockFs(mockConfig);
  
  // Update our tracking with the mock config
  Object.keys(mockConfig).forEach(key => {
    if (typeof mockConfig[key] === 'string') {
      fileSystem.files[key] = mockConfig[key];
    } else {
      fileSystem.directories[key] = true;
    }
  });
}

// Helper to restore the real file system
function restoreFilesystem() {
  mockFs.restore();
}

// Reset all mocks and stored values
function resetAllMocks() {
  existsSync.mockClear();
  readFileSync.mockClear();
  writeFileSync.mockClear();
  mkdirSync.mockClear();
  rmdirSync.mockClear();
  unlinkSync.mockClear();
  chmodSync.mockClear();
  
  // Clear the file system tracking
  Object.keys(fileSystem.files).forEach(key => delete fileSystem.files[key]);
  Object.keys(fileSystem.directories).forEach(key => delete fileSystem.directories[key]);
}

module.exports = {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmdirSync,
  unlinkSync,
  chmodSync,
  mockFilesystem,
  restoreFilesystem,
  resetAllMocks,
  fileSystem
};
