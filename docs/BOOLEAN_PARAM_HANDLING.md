# Boolean Parameter Handling in witness-run-action

This document explains how to correctly handle boolean parameters when using the witness-run-action to wrap other GitHub Actions.

## The Issue

GitHub Actions uses the YAML 1.2 Core Schema specification for parameter validation. According to this schema, boolean values must be one of the following:
- `true` or `false` (lowercase)
- `True` or `False` (title case)
- `TRUE` or `FALSE` (uppercase)
- `y`, `Y`, `yes`, `Yes`, `YES`, `n`, `N`, `no`, `No`, `NO`, `on`, `On`, `ON`, `off`, `Off`, `OFF`

When wrapping actions using `witness-run-action`, there are two ways to pass parameters to the wrapped action:

1. With the `input-` prefix: `input-parameter-name: value`
2. Directly (no prefix): `parameter-name: value`

## Recommended Approach

**For boolean parameters, we strongly recommend using the direct approach (without the `input-` prefix).**

### Example:

```yaml
# RECOMMENDED: Direct parameters (no input- prefix)
- uses: testifysec/witness-run-action@v1
  with:
    action-ref: goreleaser/goreleaser-action@v5
    install-only: true    # Boolean parameter passed directly
    
# NOT RECOMMENDED: With input- prefix
- uses: testifysec/witness-run-action@v1
  with:
    action-ref: goreleaser/goreleaser-action@v5
    input-install-only: true  # This can cause issues with some actions
```

## Technical Details

When parameters are passed with the `input-` prefix, `witness-run-action` performs processing on these parameters and then passes them to the wrapped action. This processing can cause issues with boolean values because:

1. The wrapped action expects boolean values to conform to the YAML 1.2 Core Schema
2. Any transformation of these values might make them incompatible with this schema

By using direct parameters (without the `input-` prefix), you bypass the intermediate processing, and GitHub Actions handles the parameter validation correctly according to the YAML 1.2 specification.

## Implementation Details (Updated for v1.1.x)

As of version 1.1.x, `witness-run-action` has improved handling of boolean parameters:

1. **Preservation of Boolean Formats**: All YAML 1.2 compliant boolean formats are now preserved exactly as provided by GitHub Actions. This includes:
   - Lowercase: `true`, `false`
   - Title case: `True`, `False`
   - Uppercase: `TRUE`, `FALSE`

2. **Input Prefix Processing**: When using the `input-` prefix, we now correctly transform the environment variable while preserving the exact string format of the boolean value:
   - `INPUT_INPUT-INSTALL-ONLY=true` becomes `INPUT_INSTALL_ONLY=true`
   - `INPUT_INPUT-DEBUG=FALSE` becomes `INPUT_DEBUG=FALSE`

3. **No Value Normalization**: Previous versions would normalize boolean values to lowercase, which could cause issues with actions expecting specific boolean formats.

### Processing Algorithm

1. Process `input-` prefixed parameters first
2. Apply default values from action.yml if provided
3. Track all passed inputs for logging
4. Preserve the exact string format of all values

## Default Values from action.yml

`witness-run-action` properly handles default values from the wrapped action's `action.yml` file:

1. When an action is wrapped, the wrapper reads the `action.yml` file to determine the action type
2. During this process, any default values specified in the `inputs` section are extracted
3. Environment variables are created for these defaults (`INPUT_{KEY}=default`)
4. These environment variables are then passed to the wrapped action

This ensures that default values behave correctly when wrapping actions, especially for boolean parameters that might have default values.

### Implementation Notes

The default value handling is implemented in multiple components:

1. `commandRunners.js` - Primary logic for extracting default values from action.yml
2. `WitnessActionRunner.js` - Handles the environment variable processing and boolean preservation

## When to Use Input Prefixing

The `input-` prefix is still useful in certain scenarios:

- When you need to explicitly namespace parameters to avoid conflicts
- For string or numeric parameters that don't have strict validation requirements

However, for boolean parameters, you should prefer the direct approach to ensure proper validation.

## Compatibility

This approach is compatible with all versions of `witness-run-action`. The recommended approach will work with both older and newer versions of the action. The improved boolean handling is available in version 1.1.x and later.