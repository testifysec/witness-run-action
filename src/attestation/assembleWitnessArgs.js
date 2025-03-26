/**
 * Builds the witness command arguments based on the provided options.
 * The `extraArgs` parameter can include command-specific arguments.
 */
function assembleWitnessArgs(witnessOptions, extraArgs = []) {
  const cmd = ["run"];
  const core = require('@actions/core');
  
  // Destructure all options from witnessOptions
  const {
    // Basic settings
    step,
    outfile,
    trace,
    workingdir,
    
    // Attestations
    attestations,
    
    // Archivista settings
    enableArchivista,
    archivistaServer,
    
    // Attestor settings
    exportLink,
    exportSBOM,
    exportSLSA,
    mavenPOM,
    productExcludeGlob,
    productIncludeGlob,
    
    // Hash settings
    hashes,
    
    // Environment variable settings
    envAddSensitiveKey,
    envDisableDefaultSensitiveVars,
    envExcludeSensitiveKey,
    envFilterSensitiveVars,
    
    // Dirhash settings
    dirhashGlob,
    
    // Signer settings - Sigstore
    enableSigstore,
    fulcio,
    fulcioOidcClientId,
    fulcioOidcIssuer,
    fulcioOidcRedirectUrl,
    fulcioToken,
    fulcioTokenPath,
    
    // Signer settings - File
    certificate,
    key,
    intermediates,
    
    // Signer settings - KMS (AWS)
    kmsAwsConfigFile,
    kmsAwsCredentialsFile,
    kmsAwsInsecureSkipVerify,
    kmsAwsProfile,
    kmsAwsRemoteVerify,
    
    // Signer settings - KMS (GCP)
    kmsGcpCredentialsFile,
    
    // Signer settings - KMS (General)
    kmsHashType,
    kmsKeyVersion,
    kmsRef,
    
    // Signer settings - SPIFFE
    spiffeSocket,
    
    // Signer settings - Vault
    vaultAltnames,
    vaultCommonname,
    vaultNamespace,
    vaultPkiSecretsEnginePath,
    vaultRole,
    vaultToken,
    vaultTtl,
    vaultUrl,
    
    // Timestamp servers
    timestampServers,
    
    // Additional custom arguments
    witnessArgs
  } = witnessOptions;

  // Process Sigstore settings
  if (enableSigstore) {
    const sigstoreFulcio = fulcio || "https://fulcio.sigstore.dev";
    const sigstoreClientId = fulcioOidcClientId || "sigstore";
    const sigstoreOidcIssuer = fulcioOidcIssuer || "https://oauth2.sigstore.dev/auth";
    let sigstoreTimestampServers = "https://freetsa.org/tsr";
    
    if (timestampServers) {
      sigstoreTimestampServers += " " + timestampServers;
    }
    
    cmd.push(`--signer-fulcio-url=${sigstoreFulcio}`);
    cmd.push(`--signer-fulcio-oidc-client-id=${sigstoreClientId}`);
    cmd.push(`--signer-fulcio-oidc-issuer=${sigstoreOidcIssuer}`);
    
    // Add fulcio OIDC redirect URL if provided
    if (fulcioOidcRedirectUrl) {
      cmd.push(`--signer-fulcio-oidc-redirect-url=${fulcioOidcRedirectUrl}`);
    }
    
    // Add timestamp servers
    sigstoreTimestampServers.split(" ").forEach((ts) => {
      ts = ts.trim();
      if (ts.length > 0) {
        cmd.push(`--timestamp-servers=${ts}`);
      }
    });
  }

  // Process fulcio token options regardless of sigstore being enabled
  if (fulcioToken) cmd.push(`--signer-fulcio-token=${fulcioToken}`);
  if (fulcioTokenPath) cmd.push(`--signer-fulcio-token-path=${fulcioTokenPath}`);
    
  // For non-sigstore runs, just add timestamp servers if provided (if sigstore is enabled, we already added them)
  if (!enableSigstore && timestampServers && timestampServers.length > 0) {
    timestampServers.split(" ").forEach((ts) => {
      ts = ts.trim();
      if (ts.length > 0) {
        cmd.push(`--timestamp-servers=${ts}`);
      }
    });
  }
  
  // Process file signer options
  if (certificate) cmd.push(`--signer-file-cert-path=${certificate}`);
  if (key) cmd.push(`--signer-file-key-path=${key}`);
  
  if (intermediates && intermediates.length) {
    intermediates.forEach((intermediate) => {
      intermediate = intermediate.trim();
      if (intermediate.length > 0) {
        cmd.push(`--signer-file-intermediate-paths=${intermediate}`);
      }
    });
  }
  
  // Process KMS AWS options
  if (kmsAwsConfigFile) cmd.push(`--signer-kms-aws-config-file=${kmsAwsConfigFile}`);
  if (kmsAwsCredentialsFile) cmd.push(`--signer-kms-aws-credentials-file=${kmsAwsCredentialsFile}`);
  if (kmsAwsInsecureSkipVerify) cmd.push(`--signer-kms-aws-insecure-skip-verify`);
  if (kmsAwsProfile) cmd.push(`--signer-kms-aws-profile=${kmsAwsProfile}`);
  
  // For kmsAwsRemoteVerify, we only want to add the flag if it's false, since true is the default
  if (kmsAwsRemoteVerify === false) cmd.push(`--signer-kms-aws-remote-verify=false`);
  
  // Process KMS GCP options
  if (kmsGcpCredentialsFile) cmd.push(`--signer-kms-gcp-credentials-file=${kmsGcpCredentialsFile}`);
  
  // Process KMS General options
  if (kmsHashType) cmd.push(`--signer-kms-hashType=${kmsHashType}`); // Using the same case as Witness CLI
  if (kmsKeyVersion) cmd.push(`--signer-kms-keyVersion=${kmsKeyVersion}`);
  if (kmsRef) cmd.push(`--signer-kms-ref=${kmsRef}`);
  
  // Process SPIFFE options
  if (spiffeSocket) cmd.push(`--signer-spiffe-socket-path=${spiffeSocket}`);
  
  // Process Vault options
  if (vaultAltnames && vaultAltnames.length) {
    vaultAltnames.forEach(name => {
      if (name.trim().length > 0) {
        cmd.push(`--signer-vault-altnames=${name}`);
      }
    });
  }
  
  if (vaultCommonname) cmd.push(`--signer-vault-commonname=${vaultCommonname}`);
  if (vaultNamespace) cmd.push(`--signer-vault-namespace=${vaultNamespace}`);
  if (vaultPkiSecretsEnginePath) cmd.push(`--signer-vault-pki-secrets-engine-path=${vaultPkiSecretsEnginePath}`);
  if (vaultRole) cmd.push(`--signer-vault-role=${vaultRole}`);
  if (vaultToken) cmd.push(`--signer-vault-token=${vaultToken}`);
  if (vaultTtl) cmd.push(`--signer-vault-ttl=${vaultTtl}`);
  if (vaultUrl) cmd.push(`--signer-vault-url=${vaultUrl}`);
  
  // Process attestation options
  if (attestations && attestations.length) {
    attestations.forEach((attestation) => {
      attestation = attestation.trim();
      if (attestation.length > 0) {
        cmd.push(`-a=${attestation}`);
      }
    });
  }
  
  // Process attestor options
  if (exportLink) cmd.push(`--attestor-link-export`);
  if (exportSBOM) cmd.push(`--attestor-sbom-export`);
  if (exportSLSA) cmd.push(`--attestor-slsa-export`);
  if (mavenPOM) cmd.push(`--attestor-maven-pom-path=${mavenPOM}`);
  if (productExcludeGlob) cmd.push(`--attestor-product-exclude-glob=${productExcludeGlob}`);
  if (productIncludeGlob) cmd.push(`--attestor-product-include-glob=${productIncludeGlob}`);
  
  // Process Archivista settings
  // Log the actual enable-archivista value being passed to witness
  core.info(`Passing --enable-archivista=${enableArchivista} (${typeof enableArchivista})`);
  
  // Handle boolean values by converting them to strings 'true' or 'false'
  if (enableArchivista !== undefined) {
    const stringValue = enableArchivista === true ? 'true' : 'false';
    cmd.push(`--enable-archivista=${stringValue}`);
  }
  if (archivistaServer) cmd.push(`--archivista-server=${archivistaServer}`);
  
  // Process environment variable settings
  if (envAddSensitiveKey && envAddSensitiveKey.length) {
    envAddSensitiveKey.forEach(key => {
      if (key.trim().length > 0) {
        cmd.push(`--env-add-sensitive-key=${key}`);
      }
    });
  }
  
  if (envDisableDefaultSensitiveVars) {
    cmd.push('--env-disable-default-sensitive-vars');
  }
  
  if (envExcludeSensitiveKey && envExcludeSensitiveKey.length) {
    envExcludeSensitiveKey.forEach(key => {
      if (key.trim().length > 0) {
        cmd.push(`--env-exclude-sensitive-key=${key}`);
      }
    });
  }
  
  if (envFilterSensitiveVars) {
    cmd.push('--env-filter-sensitive-vars');
  }
  
  // Process hash settings
  if (hashes && hashes.length) {
    hashes.forEach(hash => {
      if (hash.trim().length > 0) {
        cmd.push(`--hashes=${hash}`);
      }
    });
  }
  
  // Process dirhash settings
  if (dirhashGlob && dirhashGlob.length) {
    dirhashGlob.forEach(glob => {
      if (glob.trim().length > 0) {
        cmd.push(`--dirhash-glob=${glob}`);
      }
    });
  }
  
  // Process basic settings
  if (step) cmd.push(`-s=${step}`);
  if (trace) cmd.push(`--trace=${trace}`);
  if (outfile) cmd.push(`-o=${outfile}`);
  if (workingdir) cmd.push(`-d=${workingdir}`);
  
  // Process additional witness args if provided
  if (witnessArgs && witnessArgs.length > 0) {
    witnessArgs.forEach(arg => {
      if (arg.trim().length > 0) {
        cmd.push(arg);
      }
    });
  }
  
  // Clean up extraArgs to ensure they're all strings
  const cleanedExtraArgs = extraArgs.map(arg => {
    // Convert null/undefined to empty string
    if (arg === null || arg === undefined) {
      return '';
    }
    // Convert to string for all other types
    return String(arg);
  });
  
  // Debug the exact arguments being passed
  const fullCommandArgs = [...cmd, "--", ...cleanedExtraArgs];
  return fullCommandArgs;
}

module.exports = assembleWitnessArgs;