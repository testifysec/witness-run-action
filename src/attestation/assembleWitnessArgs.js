/**
 * Builds the witness command arguments based on the provided options.
 * The `extraArgs` parameter can include command-specific arguments.
 */
function assembleWitnessArgs(witnessOptions, extraArgs = []) {
  const cmd = ["run"];
  const {
    enableSigstore,
    fulcio,
    fulcioOidcClientId,
    fulcioOidcIssuer,
    timestampServers,
    attestations,
    exportLink,
    exportSBOM,
    exportSLSA,
    mavenPOM,
    certificate,
    enableArchivista,
    archivistaServer,
    fulcioToken,
    intermediates,
    key,
    productExcludeGlob,
    productIncludeGlob,
    spiffeSocket,
    step,
    trace,
    outfile
  } = witnessOptions;

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
    
    // Remove CI-specific OIDC flags that might not be supported in this version
    // Just use the standard Sigstore flags
    
    sigstoreTimestampServers.split(" ").forEach((ts) => {
      ts = ts.trim();
      if (ts.length > 0) {
        cmd.push(`--timestamp-servers=${ts}`);
      }
    });
  } else {
    // For non-sigstore runs, don't add any special flags
    // witness will run without signers by default
    
    // Add timestamp servers if provided
    if (timestampServers) {
      timestampServers.split(" ").forEach((ts) => {
        ts = ts.trim();
        if (ts.length > 0) {
          cmd.push(`--timestamp-servers=${ts}`);
        }
      });
    }
  }
  
  if (attestations && attestations.length) {
    attestations.forEach((attestation) => {
      attestation = attestation.trim();
      if (attestation.length > 0) {
        cmd.push(`-a=${attestation}`);
      }
    });
  }
  
  if (exportLink) cmd.push(`--attestor-link-export`);
  if (exportSBOM) cmd.push(`--attestor-sbom-export`);
  if (exportSLSA) cmd.push(`--attestor-slsa-export`);
  if (mavenPOM) cmd.push(`--attestor-maven-pom-path=${mavenPOM}`);
  
  if (certificate) cmd.push(`--certificate=${certificate}`);
  if (enableArchivista) cmd.push(`--enable-archivista=${enableArchivista}`);
  if (archivistaServer) cmd.push(`--archivista-server=${archivistaServer}`);
  if (fulcioToken) cmd.push(`--signer-fulcio-token=${fulcioToken}`);
  
  if (intermediates && intermediates.length) {
    intermediates.forEach((intermediate) => {
      intermediate = intermediate.trim();
      if (intermediate.length > 0) {
        cmd.push(`-i=${intermediate}`);
      }
    });
  }
  
  if (key) cmd.push(`--key=${key}`);
  if (productExcludeGlob) cmd.push(`--attestor-product-exclude-glob=${productExcludeGlob}`);
  if (productIncludeGlob) cmd.push(`--attestor-product-include-glob=${productIncludeGlob}`);
  if (spiffeSocket) cmd.push(`--spiffe-socket=${spiffeSocket}`);
  if (step) cmd.push(`-s=${step}`);
  if (trace) cmd.push(`--trace=${trace}`);
  if (outfile) cmd.push(`--outfile=${outfile}`);
  
  return [...cmd, "--", ...extraArgs];
}

module.exports = assembleWitnessArgs;