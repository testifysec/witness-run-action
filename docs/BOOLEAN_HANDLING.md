# Boolean Input Handling in witness-run-action

This document explains how boolean parameters are handled in the witness-run-action project and how to use them effectively in your workflows.

## YAML 1.2 Core Schema Specification

GitHub Actions uses the YAML 1.2 Core Schema for parsing boolean values in workflow files. According to this schema, the following values are recognized as booleans:

### True Values:
- `true`, `True`, `TRUE`
- `y`, `Y`, `yes`, `Yes`, `YES`
- `on`, `On`, `ON`

### False Values:
- `false`, `False`, `FALSE`
- `n`, `N`, `no`, `No`, `NO`
- `off`, `Off`, `OFF`

## How witness-run-action Handles Boolean Inputs

The witness-run-action follows these principles for handling boolean inputs:

1. **Format Preservation**: We preserve the original format of boolean values when passing them to wrapped actions. This ensures compatibility with actions that might be sensitive to the exact format of boolean values.

2. **YAML 1.2 Validation**: We validate boolean inputs according to the YAML 1.2 Core Schema, recognizing all the valid true/false representations.

3. **Consistent Parsing**: We use a centralized parsing function (`parseYamlBoolean`) to ensure all parts of the codebase handle boolean values consistently.

## Best Practices for Using Boolean Inputs

When using boolean parameters with witness-run-action, follow these best practices:

### 1. Direct Parameters (Recommended)

```yaml
- uses: testifysec/witness-run-action@v1
  with:
    action-ref: some/action@v1
    # Boolean parameter passed directly
    parameter-name: true  
```

### 2. Input-Prefixed Parameters (When Necessary)

If you need to use the input-prefix approach (for example, to avoid parameter name conflicts), be aware that the parameter will be transformed:

```yaml
- uses: testifysec/witness-run-action@v1
  with:
    action-ref: some/action@v1
    # Boolean parameter with input- prefix
    input-parameter-name: true
```

In this case, `input-parameter-name: true` will be transformed to the environment variable `INPUT_PARAMETER-NAME=true` (preserving the original boolean format).

## Technical Implementation Details

### Environment Variable Handling

The witness-run-action handles boolean inputs through environment variables:

1. When a workflow specifies an input like `debug: true`, GitHub Actions creates an environment variable `INPUT_DEBUG=true`.

2. Our code preserves the original format of these environment variables, maintaining compatibility with wrapped actions that might expect specific formats.

### Boolean Parsing

We provide utility functions for parsing boolean values:

- `parseYamlBoolean(value)`: Parses a string value according to YAML 1.2 Core Schema and returns a true/false value (or null if invalid).

- `isValidYamlBoolean(value)`: Checks if a string is a valid YAML 1.2 boolean.

- `validateBooleanInput(value, options)`: Validates a boolean input, preserving its original format.

## Compatibility with GitHub Actions

This approach ensures maximum compatibility with GitHub's own boolean handling behavior, as it:

1. Preserves the exact format of boolean values
2. Supports all YAML 1.2 boolean representations
3. Maintains the environment variable naming conventions used by GitHub Actions

By following these guidelines, you'll ensure the most reliable and predictable behavior when using boolean inputs with wrapped actions.