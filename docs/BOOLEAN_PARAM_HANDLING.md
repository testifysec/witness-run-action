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

## When to Use Input Prefixing

The `input-` prefix is still useful in certain scenarios:

- When you need to explicitly namespace parameters to avoid conflicts
- For string or numeric parameters that don't have strict validation requirements

However, for boolean parameters, you should prefer the direct approach to ensure proper validation.

## Compatibility

This approach is compatible with all versions of `witness-run-action`. The recommended approach will work with both older and newer versions of the action.