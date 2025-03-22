# Boolean Parameter Handling in GitHub Actions

This document explains how witness-run-action handles boolean parameters when wrapping other GitHub Actions.

## The Problem

GitHub Actions has inconsistent handling of boolean values across different contexts. The root issue is:

1. GitHub Actions' YAML parser follows the YAML 1.2 "Core Schema" specification
2. This specification has strict requirements for boolean values
3. Different actions may process boolean values differently
4. When wrapping actions, boolean values may not propagate correctly between layers

## Our Solution

Witness-run-action implements special handling for boolean parameters to ensure compatibility:

1. **Known Boolean Parameters**: We maintain a list of common boolean parameters from popular actions 
2. **Format Normalization**: We apply different formats based on the parameter type
3. **Input Prefixing**: We handle the `input-` prefix correctly to remove it before passing to wrapped actions

### Implementation Details

For known boolean parameters (e.g., `install-only`, `skip-validate`, `debug`):
- Convert to uppercase `TRUE` or `FALSE` format to comply with YAML 1.2 Core Schema
- Apply this normalization for both regular and input-prefixed parameters

For other boolean-like parameters:
- Normalize to lowercase `true` or `false` for compatibility with most actions
- Apply consistent handling regardless of input method

## Usage Patterns

When using witness-run-action to wrap other actions, you can use any of these formats:

```yaml
# Recommended format for known boolean parameters (most compatible)
- uses: testifysec/witness-run-action@main
  with:
    action-ref: "some/action@v1"
    input-some-boolean-param: "TRUE"  # or "FALSE" (uppercase and quoted)
    
# Alternative formats that will be normalized automatically
- uses: testifysec/witness-run-action@main
  with:
    action-ref: "some/action@v1"
    input-some-boolean-param: "true"  # or "false" (lowercase and quoted)
    
# YAML native format (will be normalized internally)
- uses: testifysec/witness-run-action@main
  with:
    action-ref: "some/action@v1"
    input-some-boolean-param: true  # or false (unquoted YAML boolean)
```

## Known Boolean Parameters

We maintain a list of common boolean parameters that receive special handling:

- `install-only` (GoReleaser action)
- `skip-validate` (common in many actions)
- `skip-cache` (common in many actions)
- `debug` (common in many actions)
- `disable-sandbox` (common in many actions)
- `dry-run` (common in many actions)

## Troubleshooting

If you encounter issues with boolean parameters:

1. Try using the uppercase quoted format: `"TRUE"` or `"FALSE"`
2. Check if the parameter should be added to our known boolean parameters list
3. Fall back to the command-based approach if needed