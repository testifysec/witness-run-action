/**
 * Enhanced tests for getWitnessOptions with improved boolean handling.
 */
const os = require('os');

// Create mocks
const mockCore = {
  getInput: jest.fn(),
};

const mockPath = {
  join: jest.fn(),
};

// Mock dependencies
jest.mock('@actions/core', () => mockCore);
jest.mock('path', () => mockPath);
jest.mock('os', () => ({
  tmpdir: jest.fn().mockReturnValue('/tmp'),
}));

// Import after mocking dependencies
const getWitnessOptions = require('../src/attestation/getWitnessOptions');

describe('Enhanced getWitnessOptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment';
      if (name === 'intermediates') return '';
      return '';
    });
    
    // Mock path.join
    mockPath.join.mockImplementation((...args) => args.join('/'));
  });
  
  test('handles boolean inputs correctly with lowercase true', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'enable-archivista') return 'true';
      if (name === 'enable-sigstore') return 'true';
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment';
      return '';
    });
    
    const options = getWitnessOptions();
    
    expect(options.enableArchivista).toBe(true);
    expect(options.enableSigstore).toBe(true);
  });
  
  test('handles boolean inputs correctly with uppercase TRUE', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'enable-archivista') return 'TRUE';
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment';
      return '';
    });
    
    const options = getWitnessOptions();
    
    expect(options.enableArchivista).toBe(true);
  });
  
  test('handles boolean inputs correctly with title case True', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'enable-archivista') return 'True';
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment';
      return '';
    });
    
    const options = getWitnessOptions();
    
    expect(options.enableArchivista).toBe(true);
  });
  
  test('handles yes/no boolean inputs correctly', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'enable-archivista') return 'yes';
      if (name === 'enable-sigstore') return 'no';
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment';
      return '';
    });
    
    const options = getWitnessOptions();
    
    expect(options.enableArchivista).toBe(true);
    expect(options.enableSigstore).toBe(false);
  });
  
  test('handles on/off boolean inputs correctly', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'enable-archivista') return 'on';
      if (name === 'enable-sigstore') return 'OFF';
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment';
      return '';
    });
    
    const options = getWitnessOptions();
    
    expect(options.enableArchivista).toBe(true);
    expect(options.enableSigstore).toBe(false);
  });
  
  test('uses default values for missing inputs', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment';
      return '';
    });
    
    const options = getWitnessOptions();
    
    expect(options.enableArchivista).toBe(false); // Default value
    expect(options.enableSigstore).toBe(false); // Default value
  });
  
  test('handles space-separated arrays correctly', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment slsa';
      if (name === 'intermediates') return 'int1 int2 int3';
      return '';
    });
    
    const options = getWitnessOptions();
    
    expect(options.attestations).toEqual(['github', 'environment', 'slsa']);
    expect(options.intermediates).toEqual(['int1', 'int2', 'int3']);
  });
  
  test('handles empty space-separated arrays', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return '';
      return '';
    });
    
    const options = getWitnessOptions();
    
    expect(options.attestations).toEqual([]);
    expect(options.intermediates).toEqual([]);
  });
  
  test('sets default outfile correctly', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment';
      return '';
    });
    
    mockPath.join.mockReturnValueOnce('/tmp/test-step-attestation.json');
    
    const options = getWitnessOptions();
    
    expect(mockPath.join).toHaveBeenCalledWith('/tmp', 'test-step-attestation.json');
    expect(options.outfile).toBe('/tmp/test-step-attestation.json');
  });
  
  test('uses provided outfile over default', () => {
    mockCore.getInput.mockImplementation((name) => {
      if (name === 'step') return 'test-step';
      if (name === 'attestations') return 'github environment';
      if (name === 'outfile') return 'custom-outfile.json';
      return '';
    });
    
    const options = getWitnessOptions();
    
    expect(options.outfile).toBe('custom-outfile.json');
    expect(mockPath.join).not.toHaveBeenCalled();
  });
});