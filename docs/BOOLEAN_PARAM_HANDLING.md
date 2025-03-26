# Boolean Parameter Handling in witness-run-action

This document explains how to correctly handle boolean parameters when using the witness-run-action to wrap other GitHub Actions.

## YAML 1.2 Core Schema Boolean Values

GitHub Actions uses the YAML 1.2 Core Schema for parsing boolean values in workflow files, which supports:

### True Values:
- `true`, `True`, `TRUE`
- `y`, `Y`, `yes`, `Yes`, `YES`
- `on`, `On`, `ON`

### False Values:
- `false`, `False`, `FALSE`
- `n`, `N`, `no`, `No`, `NO`
- `off`, `Off`, `OFF`

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

## Why This Approach Works Better

When parameters are passed with the `input-` prefix, additional processing occurs that might affect boolean validation. By using direct parameters, GitHub Actions handles the parameter validation correctly according to the YAML 1.2 specification.

## Implementation Notes

As of version 1.0.0, `witness-run-action` has improved handling of boolean parameters:

1. **Preservation of Boolean Formats**: All YAML 1.2 compliant boolean formats are preserved exactly as provided by GitHub Actions
2. **Default Values**: Proper handling of default values from the wrapped action's `action.yml` file
3. **Environment Variables**: Correct transformation of environment variables while preserving the exact string format of boolean values

## When to Use Input Prefixing

The `input-` prefix is still useful when:
- You need to explicitly namespace parameters to avoid conflicts
- For string or numeric parameters that don't have strict validation requirements

However, for boolean parameters, always prefer the direct approach for the most reliable behavior.