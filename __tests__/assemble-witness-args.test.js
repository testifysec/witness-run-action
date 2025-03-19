/**
 * Tests for assembleWitnessArgs function
 */
const mockCore = require('./helpers/mockCore');
const assembleWitnessArgs = require('../src/attestation/assembleWitnessArgs');

describe('assembleWitnessArgs', () => {
  test('should build basic command args correctly', () => {
    const options = {
      step: 'test-step',
      enableSigstore: false
    };
    
    const args = assembleWitnessArgs(options);
    
    expect(args).toEqual(['run', '-s=test-step', '--']);
  });
  
  test('should add sigstore arguments when enabled', () => {
    const options = {
      step: 'test-step',
      enableSigstore: true,
      fulcio: 'https://custom-fulcio.com',
      fulcioOidcClientId: 'custom-client',
      fulcioOidcIssuer: 'https://custom-issuer.com'
    };
    
    const args = assembleWitnessArgs(options);
    
    expect(args).toContain('--signer-fulcio-url=https://custom-fulcio.com');
    expect(args).toContain('--signer-fulcio-oidc-client-id=custom-client');
    expect(args).toContain('--signer-fulcio-oidc-issuer=https://custom-issuer.com');
  });
  
  test('should use default sigstore values when not provided', () => {
    const options = {
      step: 'test-step',
      enableSigstore: true
    };
    
    const args = assembleWitnessArgs(options);
    
    expect(args).toContain('--signer-fulcio-url=https://fulcio.sigstore.dev');
    expect(args).toContain('--signer-fulcio-oidc-client-id=sigstore');
    expect(args).toContain('--signer-fulcio-oidc-issuer=https://oauth2.sigstore.dev/auth');
  });
  
  test('should add timestamp servers when provided', () => {
    const options = {
      step: 'test-step',
      enableSigstore: false,
      timestampServers: 'https://timestamp1.com https://timestamp2.com'
    };
    
    const args = assembleWitnessArgs(options);
    
    expect(args).toContain('--timestamp-servers=https://timestamp1.com');
    expect(args).toContain('--timestamp-servers=https://timestamp2.com');
  });
  
  test('should add attestations when provided', () => {
    const options = {
      step: 'test-step',
      attestations: ['git', 'environment']
    };
    
    const args = assembleWitnessArgs(options);
    
    expect(args).toContain('-a=git');
    expect(args).toContain('-a=environment');
  });
  
  test('should add export flags when enabled', () => {
    const options = {
      step: 'test-step',
      exportLink: true,
      exportSBOM: true,
      exportSLSA: true,
      mavenPOM: '/path/to/pom.xml'
    };
    
    const args = assembleWitnessArgs(options);
    
    expect(args).toContain('--attestor-link-export');
    expect(args).toContain('--attestor-sbom-export');
    expect(args).toContain('--attestor-slsa-export');
    expect(args).toContain('--attestor-maven-pom-path=/path/to/pom.xml');
  });
  
  test('should add optional parameters when provided', () => {
    const options = {
      step: 'test-step',
      certificate: '/path/to/cert',
      enableArchivista: true,
      archivistaServer: 'https://archivista.example.com',
      fulcioToken: 'token123',
      intermediates: ['int1', 'int2'],
      key: '/path/to/key',
      productExcludeGlob: '*.tmp',
      productIncludeGlob: '*.js',
      spiffeSocket: '/path/to/socket',
      trace: 'debug',
      outfile: '/path/to/output.json'
    };
    
    const args = assembleWitnessArgs(options);
    
    expect(args).toContain('--certificate=/path/to/cert');
    expect(args).toContain('--enable-archivista=true');
    expect(args).toContain('--archivista-server=https://archivista.example.com');
    expect(args).toContain('--signer-fulcio-token=token123');
    expect(args).toContain('-i=int1');
    expect(args).toContain('-i=int2');
    expect(args).toContain('--key=/path/to/key');
    expect(args).toContain('--attestor-product-exclude-glob=*.tmp');
    expect(args).toContain('--attestor-product-include-glob=*.js');
    expect(args).toContain('--spiffe-socket=/path/to/socket');
    expect(args).toContain('-s=test-step');
    expect(args).toContain('--trace=debug');
    expect(args).toContain('--outfile=/path/to/output.json');
  });
  
  test('should append extra args after --', () => {
    const options = {
      step: 'test-step'
    };
    
    const extraArgs = ['npm', 'test'];
    const args = assembleWitnessArgs(options, extraArgs);
    
    expect(args).toEqual(['run', '-s=test-step', '--', 'npm', 'test']);
  });
});