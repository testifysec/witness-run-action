/**
 * Tests for getWitnessOptions function
 */
const mockCore = require('./helpers/mockCore');
const path = require('path');
const os = require('os');

// Mock core module
jest.mock('@actions/core', () => mockCore);

// Import the function to test
const getWitnessOptions = require('../src/attestation/getWitnessOptions');

describe('getWitnessOptions', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockCore.resetAllMocks();
  });

  test('should correctly parse action inputs', () => {
    // Set up test inputs
    mockCore.setInputs({
      'step': 'build',
      'archivista-server': 'https://test-archivista.com',
      'attestations': 'git environment',
      'certificate': '/path/to/cert',
      'enable-archivista': 'true',
      'fulcio': 'https://test-fulcio.com',
      'fulcio-oidc-client-id': 'test-client',
      'fulcio-oidc-issuer': 'https://test-issuer.com',
      'fulcio-token': 'test-token',
      'intermediates': 'int1 int2',
      'key': '/path/to/key',
      'outfile': '/custom/output.json',
      'product-exclude-glob': '*.bak',
      'product-include-glob': '*.js',
      'spiffe-socket': '/path/to/socket',
      'timestamp-servers': 'ts1 ts2',
      'trace': 'debug',
      'enable-sigstore': 'true',
      'attestor-link-export': 'true',
      'attestor-sbom-export': 'true',
      'attestor-slsa-export': 'true',
      'attestor-maven-pom-path': '/path/to/pom.xml'
    });

    // Call the function
    const options = getWitnessOptions();

    // Verify results
    expect(options).toEqual({
      step: 'build',
      archivistaServer: 'https://test-archivista.com',
      attestations: ['git', 'environment'],
      certificate: '/path/to/cert',
      enableArchivista: true,
      fulcio: 'https://test-fulcio.com',
      fulcioOidcClientId: 'test-client',
      fulcioOidcIssuer: 'https://test-issuer.com',
      fulcioToken: 'test-token',
      intermediates: ['int1', 'int2'],
      key: '/path/to/key',
      outfile: '/custom/output.json',
      productExcludeGlob: '*.bak',
      productIncludeGlob: '*.js',
      spiffeSocket: '/path/to/socket',
      timestampServers: 'ts1 ts2',
      trace: 'debug',
      enableSigstore: true,
      exportLink: true,
      exportSBOM: true,
      exportSLSA: true,
      mavenPOM: '/path/to/pom.xml'
    });
  });

  test('should handle boolean conversions correctly', () => {
    mockCore.setInputs({
      'step': 'test',
      'enable-archivista': 'false',
      'enable-sigstore': 'false',
      'attestor-link-export': 'false',
      'attestor-sbom-export': 'false',
      'attestor-slsa-export': 'false'
    });

    const options = getWitnessOptions();

    expect(options.enableArchivista).toBe(false);
    expect(options.enableSigstore).toBe(false);
    expect(options.exportLink).toBe(false);
    expect(options.exportSBOM).toBe(false);
    expect(options.exportSLSA).toBe(false);
  });

  test('should generate default outfile path if not provided', () => {
    mockCore.setInputs({
      'step': 'test-step'
    });

    const options = getWitnessOptions();

    const expectedOutfile = path.join(os.tmpdir(), 'test-step-attestation.json');
    expect(options.outfile).toBe(expectedOutfile);
  });

  test('should handle empty values properly', () => {
    mockCore.setInputs({
      'step': 'test-step',
      'attestations': '',
      'intermediates': ''
    });

    const options = getWitnessOptions();

    // Empty strings split into an array with one empty element
    expect(options.attestations).toEqual(['']);
    expect(options.intermediates).toEqual(['']);
  });
});