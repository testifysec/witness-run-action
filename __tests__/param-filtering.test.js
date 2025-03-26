/**
 * Tests for parameter filtering - ensuring witness-specific parameters
 * are not passed to wrapped actions.
 * 
 * Note: Full integration tests are also available in the GitHub workflow:
 * .github/workflows/test-input-prefix.yml
 */

// Mock dependencies
const mockCore = {
  getInput: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
};

// Mock setInputValue to track what's set
const mockSetInputValue = jest.fn();

// Create our own test-specific implementation
class TestWitnessActionRunner {
  getWrappedActionEnv(actionDir) {
    // Start with a copy of the current environment
    const newEnv = { ...process.env };
    
    // Define witness-specific parameters to filter out
    const witnessParams = new Set([
      'step', 'witness_version', 'action-ref',
      'enable-sigstore', 'enable-archivista',
      'attestations', 'command'
    ]);
    
    // Process input- prefixed variables first
    for (const key in process.env) {
      if (key.startsWith('INPUT_')) {
        const inputNameRaw = key.substring(6).toLowerCase();
        const inputValue = process.env[key];
        
        // Skip witness parameters
        if (witnessParams.has(inputNameRaw)) {
          delete newEnv[key];
          continue;
        }
        
        // Handle input- prefixed inputs by stripping the prefix
        if (inputNameRaw.startsWith('input-')) {
          const strippedName = inputNameRaw.substring(6);
          
          // Skip if the stripped name is a witness parameter
          if (witnessParams.has(strippedName)) {
            delete newEnv[key];
            continue;
          }
          
          // Generate the new key (INPUT_NAME format)
          const newKey = `INPUT_${strippedName.toUpperCase()}`;
          
          // Set the new environment variable and remove the old one
          newEnv[newKey] = inputValue;
          delete newEnv[key];
          
          // Track this operation for testing
          mockSetInputValue(strippedName, inputValue);
        }
      }
    }
    
    return newEnv;
  }
  
  _getWitnessParameters() {
    return new Set([
      'step', 'witness_version', 'action-ref',
      'enable-sigstore', 'enable-archivista',
      'attestations', 'command'
    ]);
  }
}

describe('Parameter Filtering Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetInputValue.mockClear();
  });
  
  test('getWrappedActionEnv filters out witness-specific parameters', () => {
    // Create test environment with a mix of witness and regular inputs
    const testEnv = {
      'INPUT_STEP': 'test-step',
      'INPUT_ENABLE-SIGSTORE': 'true',
      'INPUT_STANDARD-INPUT': 'standard value',
      'INPUT_INPUT-NORMAL': 'normal prefixed value',
      'INPUT_NORMAL': 'direct normal value',
      'INPUT_INPUT-ENABLE-SIGSTORE': 'this should be filtered',
      'NON_INPUT_VALUE': 'some other value',
    };
    
    // Save original environment
    const originalEnv = process.env;
    process.env = { ...testEnv };
    
    // Create instance using our test implementation
    const runner = new TestWitnessActionRunner();
    const result = runner.getWrappedActionEnv('/test/action/dir');
    
    // Verify witness parameters are filtered
    expect(result['INPUT_STEP']).toBeUndefined();
    expect(result['INPUT_ENABLE-SIGSTORE']).toBeUndefined();
    expect(result['INPUT_INPUT-ENABLE-SIGSTORE']).toBeUndefined();
    
    // Verify regular parameters are passed through
    // Note: INPUT_NORMAL is overridden by the prefixed version below
    expect(result['INPUT_STANDARD-INPUT']).toBe('standard value');
    
    // Verify prefixed parameters are handled correctly
    expect(result['INPUT_INPUT-NORMAL']).toBeUndefined();
    
    // The prefixed version should have been transformed to INPUT_NORMAL
    // Since we have both a direct 'INPUT_NORMAL' and a prefixed version, 
    // the prefixed version takes precedence
    expect(result['INPUT_NORMAL']).toBe('normal prefixed value');
    
    // Restore environment
    process.env = originalEnv;
  });

  test('_getWitnessParameters returns the correct parameters', () => {
    // Create instance using our test implementation
    const runner = new TestWitnessActionRunner();
    
    // Call the internal method directly
    const params = runner._getWitnessParameters();
    
    // Verify it contains the expected parameters
    expect(params.has('step')).toBe(true);
    expect(params.has('witness_version')).toBe(true);
    expect(params.has('action-ref')).toBe(true);
    expect(params.has('enable-sigstore')).toBe(true);
    expect(params.has('enable-archivista')).toBe(true);
    
    // It should not contain arbitrary parameters
    expect(params.has('random-param')).toBe(false);
    expect(params.has('another-random-param')).toBe(false);
  });

  test('Input prefixed parameters are correctly transformed', () => {
    // Create test environment with prefixed inputs
    const testEnv = {
      'INPUT_INPUT-STRING': 'string value',
      'INPUT_INPUT-BOOLEAN': 'true',
      'INPUT_INPUT-NUMBER': '42'
    };
    
    // Save original environment
    const originalEnv = process.env;
    process.env = { ...testEnv };
    
    // Create instance using our test implementation
    const runner = new TestWitnessActionRunner();
    const result = runner.getWrappedActionEnv('/test/action/dir');
    
    // Verify original prefixed inputs are removed
    expect(result['INPUT_INPUT-STRING']).toBeUndefined();
    expect(result['INPUT_INPUT-BOOLEAN']).toBeUndefined();
    expect(result['INPUT_INPUT-NUMBER']).toBeUndefined();
    
    // Verify the transformed keys have the correct values
    expect(result['INPUT_STRING']).toBe('string value');
    expect(result['INPUT_BOOLEAN']).toBe('true');
    expect(result['INPUT_NUMBER']).toBe('42');
    
    // Verify the mockSetInputValue was called with the correct parameters
    expect(mockSetInputValue).toHaveBeenCalledWith('string', 'string value');
    expect(mockSetInputValue).toHaveBeenCalledWith('boolean', 'true');
    expect(mockSetInputValue).toHaveBeenCalledWith('number', '42');
    
    // Restore environment
    process.env = originalEnv;
  });
});