/**
 * Reads inputs and constructs the witnessOptions object.
 */
const core = require("@actions/core");
const path = require("path");
const os = require("os");
const { parseYamlBoolean } = require("../utils/booleanUtils");

/**
 * Get a boolean value from an input, properly handling YAML 1.2 boolean formats.
 * 
 * @param {string} name - The name of the input parameter
 * @param {boolean} defaultValue - The default value if input is invalid or missing
 * @returns {boolean} The parsed boolean value
 */
function getBooleanInput(name, defaultValue = false) {
  const value = core.getInput(name);
  if (!value) return defaultValue;
  
  const parsedValue = parseYamlBoolean(value);
  return parsedValue !== null ? parsedValue : defaultValue;
}

/**
 * Reads inputs and constructs the witnessOptions object.
 * 
 * @returns {Object} The witness options object with all configurations
 */
function getWitnessOptions() {
  let outfile = core.getInput("outfile");
  const step = core.getInput("step");
  outfile = outfile ? outfile : path.join(os.tmpdir(), `${step}-attestation.json`);
  
  // Split space-separated values into arrays, handling empty strings
  const splitInputToArray = (input) => {
    const value = core.getInput(input);
    return value ? value.split(" ").filter(Boolean) : [];
  };
  
  return {
    // Basic settings
    step,
    outfile,
    trace: core.getInput("witness_trace"),
    workingdir: core.getInput("workingdir"),
    
    // Archivista settings
    enableArchivista: getBooleanInput("enable-archivista"),
    archivistaServer: core.getInput("archivista-server"),
    
    // Attestation settings
    attestations: splitInputToArray("attestations"),
    
    // Attestor settings
    exportLink: getBooleanInput("attestor-link-export"),
    exportSBOM: getBooleanInput("attestor-sbom-export"),
    exportSLSA: getBooleanInput("attestor-slsa-export"),
    mavenPOM: core.getInput("attestor-maven-pom-path"),
    productExcludeGlob: core.getInput("product-exclude-glob"),
    productIncludeGlob: core.getInput("product-include-glob"),
    
    // Sigstore settings
    enableSigstore: getBooleanInput("enable-sigstore"),
    
    // Signer file settings
    certificate: core.getInput("certificate"),
    key: core.getInput("key"),
    intermediates: splitInputToArray("intermediates"),
    
    // Fulcio settings
    fulcio: core.getInput("fulcio"),
    fulcioOidcClientId: core.getInput("fulcio-oidc-client-id"),
    fulcioOidcIssuer: core.getInput("fulcio-oidc-issuer"),
    fulcioOidcRedirectUrl: core.getInput("fulcio-oidc-redirect-url"),
    fulcioToken: core.getInput("fulcio-token"),
    fulcioTokenPath: core.getInput("fulcio-token-path"),
    
    // KMS settings - AWS
    kmsAwsConfigFile: core.getInput("kms-aws-config-file"),
    kmsAwsCredentialsFile: core.getInput("kms-aws-credentials-file"),
    kmsAwsInsecureSkipVerify: getBooleanInput("kms-aws-insecure-skip-verify"),
    kmsAwsProfile: core.getInput("kms-aws-profile"),
    kmsAwsRemoteVerify: getBooleanInput("kms-aws-remote-verify", true),
    
    // KMS settings - GCP
    kmsGcpCredentialsFile: core.getInput("kms-gcp-credentials-file"),
    
    // KMS settings - General
    kmsHashType: core.getInput("kms-hash-type"),
    kmsKeyVersion: core.getInput("kms-key-version"),
    kmsRef: core.getInput("kms-ref"),
    
    // SPIFFE settings
    spiffeSocket: core.getInput("spiffe-socket"),
    
    // Vault settings
    vaultAltnames: splitInputToArray("vault-altnames"),
    vaultCommonname: core.getInput("vault-commonname"),
    vaultNamespace: core.getInput("vault-namespace"),
    vaultPkiSecretsEnginePath: core.getInput("vault-pki-secrets-engine-path"),
    vaultRole: core.getInput("vault-role"),
    vaultToken: core.getInput("vault-token"),
    vaultTtl: core.getInput("vault-ttl"),
    vaultUrl: core.getInput("vault-url"),
    
    // Timestamp settings
    timestampServers: core.getInput("timestamp-servers"),
    
    // Hash settings
    hashes: splitInputToArray("hashes"),
    
    // Environment variable settings
    envAddSensitiveKey: splitInputToArray("env-add-sensitive-key"),
    envDisableDefaultSensitiveVars: getBooleanInput("env-disable-default-sensitive-vars"),
    envExcludeSensitiveKey: splitInputToArray("env-exclude-sensitive-key"),
    envFilterSensitiveVars: getBooleanInput("env-filter-sensitive-vars"),
    
    // Dirhash settings
    dirhashGlob: splitInputToArray("dirhash-glob"),
    
    // Additional custom arguments
    witnessArgs: splitInputToArray("witness-args"),
  };
}

module.exports = getWitnessOptions;