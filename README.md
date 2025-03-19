# Witness Run-Action

# Witness Run GitHub Action

This GitHub Action allows you to create an attestation for your CI process using
the Witness tool. It supports optional integration with Sigstore for signing and
Archivista for attestation storage and distibution.

## Usage

To use this action, include it in your GitHub workflow YAML file.

### Basic Example

```yaml
permissions:
  id-token: write # This is required for requesting the JWT
  contents: read  # This is required for actions/checkout

name: Example Workflow
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v0.1.3

      - name: Witness Run
        uses: testifysec/witness-run-action@v1
        with:
          step: build
          enable-archivista: false
          enable-sigstore: false
          command: make build
```

### Wrapping GitHub Actions

You can also use this action to wrap other GitHub Actions, creating attestations for them:

```yaml
permissions:
  id-token: write # This is required for requesting the JWT
  contents: read  # This is required for actions/checkout

name: Action Wrapping Example
on: [push, pull_request]

jobs:
  test-wrapped-action:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Wrap Another Action
        uses: testifysec/witness-run-action@v1
        with:
          # Action to run
          action-ref: "actions/hello-world-javascript-action@main"
          
          # Inputs to the wrapped action with input- prefix
          input-who-to-greet: "Sigstore"
          
          # Direct inputs (if they don't conflict with witness-run inputs)
          who-to-greet: "SigstoreNoPrefix"
          
          # Witness configuration
          step: test-action-wrapper
          attestations: "environment github slsa"
          attestor-slsa-export: "true"
          enable-sigstore: "true"
          enable-archivista: "true"
```

When wrapping an action:
1. Specify the action reference using `action-ref` in the format `owner/repo@ref`
2. Pass inputs to the wrapped action using the `input-` prefix
3. You can also pass inputs directly if they don't conflict with witness-run's own inputs
4. JavaScript-based actions, composite actions, and Docker container actions are supported

## Composite Actions

As of witness-run-action@1.0.0, this action supports running composite actions. This means that you
can use `witness-run-action` to run a GitHub Action that is defined as a composite action.

For example:

```yaml
- name: Run Composite Action with Witness
  uses: testifysec/witness-run-action@main
  with:
    step: "run-composite-action"
    action-ref: "pcolby/hello-world-composite-action@v1.0.0"
    who-to-greet: "GitHub Actions"
```

### Nested Composite Actions

Starting from this version, witness-run-action also supports nested composite actions. This means that a composite action can use other actions within its steps using the `uses` keyword. This enables more complex attestation workflows with multi-level action nesting.

#### Supported Formats for Nested Actions

The following formats are supported for referencing actions within composite actions:

1. Public GitHub Actions: `owner/repo@ref` (e.g., `actions/setup-node@v4`)
2. Local actions: `./path/to/action` (relative to the repository root)
3. Actions with implicit references: `owner/repo` (defaults to @main)

#### Input/Output Propagation

Nested actions can:
- Receive inputs from parent actions using `${{ inputs.parameter-name }}`
- Share outputs between steps using `${{ steps.step-id.outputs.output-name }}`
- Expose outputs to parent actions

#### Example of a Composite Action with Nested Actions

```yaml
# In action.yml
name: 'Nested Action Demo'
description: 'Demonstrates nested action capabilities'
inputs:
  who-to-greet:
    description: 'Who to greet'
    required: true
    default: 'World'
outputs:
  node-version:
    description: 'The detected Node.js version'
    value: ${{ steps.node-info.outputs.version }}
runs:
  using: 'composite'
  steps:
    - name: First Step
      run: echo "First step greeting ${{ inputs.who-to-greet }}"
      shell: bash
      
    - name: Use another action (nested)
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        
    - name: Get Node.js info
      id: node-info
      run: |
        echo "version=$(node --version)" >> $GITHUB_OUTPUT
      shell: bash
        
    - name: Use GitHub Script (third-level nesting)
      uses: actions/github-script@v6
      with:
        debug: false
        script: |
          console.log('Hello from GitHub Script inside a nested action!');
          
    - name: Final Step
      run: echo "Completed with Node ${{ steps.node-info.outputs.version }}"
      shell: bash
```

#### Running a Nested Composite Action with Witness

You can run this composite action with witness-run-action using:

```yaml
- name: Run Nested Composite Action with Witness
  uses: testifysec/witness-run-action@main
  with:
    step: "run-nested-action"
    action-ref: "owner/nested-action-demo@main"
    who-to-greet: "GitHub Actions"
    github-token: ${{ github.token }}  # Pass token for GitHub API operations
```

#### Important Notes for Nested Actions

1. **Token Passing**: When using actions that require GitHub token access (like `github-script`), be sure to pass the token explicitly
2. **Path Resolution**: Scripts in composite actions can reference files in the action's directory using `${{ github.action_path }}`
3. **Debug Flags**: Some actions (like `github-script`) require explicit debug parameters
4. **Deeply Nested Actions**: The implementation supports multiple levels of action nesting (an action using another action that uses another action)

## Docker Container Actions

Starting from version 1.1.0, witness-run-action supports Docker container actions. This enables creating attestations for actions that run in Docker containers, either using Dockerfiles or pre-built Docker images.

### Features

- Support for Dockerfile-based actions
- Support for pre-built Docker image actions (docker:// format)
- Proper environment variable and input processing
- Volume mapping to ensure access to GITHUB_WORKSPACE
- Custom entrypoint support
- Argument processing with GitHub expression substitution

### Example of Running a Docker Action with Witness

```yaml
- name: Run Docker Action with Witness
  uses: testifysec/witness-run-action@main
  with:
    step: "run-docker-action"
    action-ref: "docker-action/example@v1"
    input-parameter1: "value1"
    input-parameter2: "value2"
    enable-sigstore: true
    enable-archivista: true
```

### Requirements

- Docker must be installed and accessible on the runner
- The runner must have sufficient permissions to run Docker containers
- For Dockerfile-based actions, the Dockerfile must be present in the action repository

### Technical Details

When running Docker container actions, witness-run-action:

1. Verifies Docker installation
2. For Dockerfile-based actions: builds the Docker image from the Dockerfile in the action repository
3. For pre-built images: pulls the Docker image from the registry
4. Sets up proper volume mapping to ensure the container has access to the workspace files
5. Configures environment variables based on inputs and GitHub environment
6. Runs the container with witness attestation
7. Captures the output and creates attestations

## Using Sigstore and Archivista Flags
This action supports the use of Sigstore and Archivista for creating attestations.
By enabling the option `enable-archivista`, you create a public record of your
attestations, which can be useful for transparency and compliance.

### Sigstore
Sigstore is an open-source platform for securely signing software artifacts. When
the `enable-sigstore` flag is set to true, this action will use Sigstore for signing
the attestation. This creates a publicly verifiable record of the attestation on
the Sigstore public instance, sigstore.dev

### Archivista
Archivista is a server that stores and retrieves attestations. When the `enable-archivista`
flag is set to true, this action will use Archivista for storing and retrieving
attestations. By default, the attestations are stored on a public Archivista server,
`https://archivista.testifysec.io`, making the details publicly accessible. This server
also has no guarantees on data availability or integrity.

### TimeStamping

By default when using Sigstore, this action utilizes FreeTSA, a free and public
Timestamp Authority (TSA) service, to provide trusted timestamping for your
attestations. Timestamping is a critical aspect of creating non-repudiable and
legally binding attestations. FreeTSA offers a reliable and convenient solution for
timestamping without the need for setting up and managing your own TSA. When using
this action, the `timestamp-servers` input is set to FreeTSA's service (https://freetsa.org/)
by default, ensuring your attestations are properly timestamped with a trusted and
publicly verifiable source.

### Privacy Considerations
If you want to keep the details of your attestations private, you can set up
and host your own instances of Archivista and Sigstore. This allows you to manage
access control and ensure that only authorized users can view the attestation details.

To use your own instances, set the `archivista-server` input to the URL of your
Archivista server, and the fulcio input to the address of your Sigstore instance.
Additionally, you'll need to configure the `fulcio-oidc-client-id` and `fulcio-oidc-issuer`
inputs to match your Sigstore instance's OIDC configuration.

Please consult the documentation for Archivista and Sigstore on how to set up and
host your own instances.


### Inputs

| Name                     | Description                                                                                          | Required | Default                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | -------- | ------------------------------------- |
| witness-install-dir      | Directory to install the witness tool into. The directory will attempted to be created if it does not exists | No       | ./ |
| action-ref               | Reference to a GitHub Action to run (format: owner/repo@ref). If provided, command is ignored.      | No*      |                                       |
| command                  | Command to run (not needed if action-ref is provided)                                               | No*      |                                       |
| enable-sigstore          | Use Sigstore for attestation. Sets default values for fulcio, fulcio-oidc-client-id, fulcio-oidc-issuer, and timestamp-servers when true | No       | true |
| enable-archivista        | Use Archivista to store or retrieve attestations                                                     | No       | true                                 | true |
| archivista-server        | URL of the Archivista server to store or retrieve attestations                                       | No       | <https://archivista.testifysec.io>      |
| attestations             | Attestations to record, space-separated                                                              | No       | environment git github                      |
| certificate              | Path to the signing key's certificate                                                                | No       |                                       |
| fulcio                   | Fulcio address to sign with                                                                          | No       |                                       |
| fulcio-oidc-client-id    | OIDC client ID to use for authentication                                                             | No       |                                       |
| fulcio-oidc-issuer       | OIDC issuer to use for authentication                                                                | No       |                                       |
| fulcio-token             | Raw token to use for authentication                                                                  | No       |                                       |
| intermediates            | Intermediates that link trust back to a root of trust in the policy, space-separated                | No       |                                       |
| key                      | Path to the signing key                                                                              | No       |                                       |
| outfile                  | File to which to write signed data. Defaults to stdout                                               | No       |                                       |
| product-exclude-glob     | Pattern to use when recording products. Files that match this pattern will be excluded as subjects on the attestation. | No       |                                       |
| product-include-glob     | Pattern to use when recording products. Files that match this pattern will be included as subjects on the attestation. | No       | *                                     |
| spiffe-socket            | Path to the SPIFFE Workload API socket                                                               | No       |                                       |
| step                     | Name of the step being run                                                                           | Yes      |                                       |
| timestamp-servers        | Timestamp Authority Servers to use when signing envelope, space-separated                           | No       |                                       |
| trace                    | Enable tracing for the command                                                                       | No       | false                                 |
| workingdir               | Directory from which commands will run                                                               | No       |                                       |

\* Either `command` or `action-ref` must be provided

