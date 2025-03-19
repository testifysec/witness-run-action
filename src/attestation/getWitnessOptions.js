/**
 * Reads inputs and constructs the witnessOptions object.
 */
const core = require("@actions/core");
const path = require("path");
const os = require("os");

function getWitnessOptions() {
  let outfile = core.getInput("outfile");
  const step = core.getInput("step");
  outfile = outfile ? outfile : path.join(os.tmpdir(), `${step}-attestation.json`);
  
  return {
    step,
    archivistaServer: core.getInput("archivista-server"),
    attestations: core.getInput("attestations").split(" "),
    certificate: core.getInput("certificate"),
    enableArchivista: core.getInput("enable-archivista") === "true",
    fulcio: core.getInput("fulcio"),
    fulcioOidcClientId: core.getInput("fulcio-oidc-client-id"),
    fulcioOidcIssuer: core.getInput("fulcio-oidc-issuer"),
    fulcioToken: core.getInput("fulcio-token"),
    intermediates: core.getInput("intermediates").split(" "),
    key: core.getInput("key"),
    outfile,
    productExcludeGlob: core.getInput("product-exclude-glob"),
    productIncludeGlob: core.getInput("product-include-glob"),
    spiffeSocket: core.getInput("spiffe-socket"),
    timestampServers: core.getInput("timestamp-servers"),
    trace: core.getInput("trace"),
    enableSigstore: core.getInput("enable-sigstore") === "true",
    exportLink: core.getInput("attestor-link-export") === "true",
    exportSBOM: core.getInput("attestor-sbom-export") === "true",
    exportSLSA: core.getInput("attestor-slsa-export") === "true",
    mavenPOM: core.getInput("attestor-maven-pom-path"),
  };
}

module.exports = getWitnessOptions;