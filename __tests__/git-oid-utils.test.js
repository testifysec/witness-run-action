/**
 * Tests for gitOidUtils functions
 */
const fs = require('fs');
const core = require('@actions/core');

// Use the mock helpers
const mockCore = require('./helpers/mockCore');

// Mock dependencies
jest.mock('@actions/core', () => mockCore);

const mockFs = {
  readFileSync: jest.fn(() => 'existing content'),
  appendFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true)
};
jest.mock('fs', () => mockFs);

// Import module after mocks are set up
const { extractDesiredGitOIDs, handleGitOIDs } = require('../src/attestation/gitOidUtils');

describe('gitOidUtils', () => {
  let consoleLogSpy;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockCore.resetAllMocks();
    
    // Mock console.log
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // Set up environment
    process.env.GITHUB_STEP_SUMMARY = '/github/step-summary';
  });
  
  afterEach(() => {
    consoleLogSpy.mockRestore();
    delete process.env.GITHUB_STEP_SUMMARY;
  });
  
  describe('extractDesiredGitOIDs', () => {
    test('should extract GitOIDs from witness output', () => {
      const testOutput = `
        Starting witness run
        Executing command
        Stored in archivista as 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
        Command completed successfully
        Stored in archivista as abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
      `;
      
      const gitOIDs = extractDesiredGitOIDs(testOutput);
      
      expect(gitOIDs).toHaveLength(2);
      expect(gitOIDs[0]).toBe('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
      expect(gitOIDs[1]).toBe('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
    });
    
    test('should return empty array when no GitOIDs are found', () => {
      const testOutput = `
        Starting witness run
        Executing command
        Command completed successfully
        No GitOIDs stored
      `;
      
      const gitOIDs = extractDesiredGitOIDs(testOutput);
      
      expect(gitOIDs).toHaveLength(0);
    });
  });
  
  describe('handleGitOIDs', () => {
    test('should process GitOIDs and update GitHub step summary', () => {
      // Mock output that contains a GitOID
      const mockOutput = 'Stored in archivista as 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const archivistaServer = 'https://example.com';
      const step = 'test-step';
      const attestations = ['git', 'environment'];
      
      // Call the function
      handleGitOIDs(mockOutput, archivistaServer, step, attestations);
      
      // Verify output was set
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'git_oid',
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
      
      // Verify summary header was written if not already present
      const expectedHeader = `
## Attestations Created
| Step | Attestors Run | Attestation GitOID
| --- | --- | --- |
`;
      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        '/github/step-summary',
        expectedHeader
      );

      // Verify GitOID row was written with proper format
      const expectedRow = `| test-step | git, environment | [1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef](https://example.com/download/1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef) |\n`;
      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        '/github/step-summary',
        expectedRow
      );
    });
    
    test('should not process anything when no GitOIDs are found', () => {
      // Call with output that doesn't contain GitOIDs
      handleGitOIDs('No GitOIDs here', 'https://example.com', 'test-step', ['git']);
      
      // Verify no outputs or summaries were set
      expect(mockCore.setOutput).not.toHaveBeenCalled();
      expect(mockFs.appendFileSync).not.toHaveBeenCalled();
    });
    
    test('should handle missing GITHUB_STEP_SUMMARY gracefully', () => {
      // Delete the environment variable
      delete process.env.GITHUB_STEP_SUMMARY;
      
      // Mock output that contains a GitOID
      const mockOutput = 'Stored in archivista as 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      
      // Should not throw error
      expect(() => {
        handleGitOIDs(mockOutput, 'https://example.com', 'test-step', ['git']);
      }).not.toThrow();
      
      // Should still set the output
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'git_oid',
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      );
      
      // But should not try to update the summary
      expect(mockFs.appendFileSync).not.toHaveBeenCalled();
    });
  });
});