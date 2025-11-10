# Witness Run Action Examples

This directory contains examples demonstrating various ways to use the `witness-run-action`, particularly focusing on the `use-witness` parameter for conditional attestation.

## Overview

The `use-witness` parameter provides an escape valve for non-transient errors that might occur when using `witness-run-action`. For instance, if the public Fulcio service goes down or other downstream dependencies fail, you can quickly disable witness attestation without requiring a pull request, allowing you to unblock your pipelines immediately.

## Examples

### 1. Basic Usage with Environment Variable ([use-witness-with-env-var.yml](./use-witness-with-env-var.yml))

This example shows the basic pattern for using a repository variable to control witness attestation.

**Setup:**
1. Go to your repository: Settings → Secrets and variables → Actions → Variables
2. Create a new variable named `USE_WITNESS` with value `true`
3. To disable witness during an outage, change the value to `false`

**Usage in workflow:**
```yaml
with:
  use-witness: ${{ vars.USE_WITNESS == 'true' || vars.USE_WITNESS == '' }}
```

### 2. Emergency Disable Pattern ([emergency-disable-witness.yml](./emergency-disable-witness.yml))

This example demonstrates a recommended pattern for emergency disabling of witness across all workflow jobs.

**Setup:**
1. Create a repository variable `WITNESS_ENABLED` (leave empty or set to `true`)
2. During an emergency, set `WITNESS_ENABLED` to `false`
3. All workflow runs will automatically skip witness attestation
4. Once resolved, delete the variable or set it back to `true`

**Usage in workflow:**
```yaml
with:
  use-witness: ${{ vars.WITNESS_ENABLED != 'false' }}
```

This pattern defaults to **enabled** when the variable is not set, providing safety.

### 3. Advanced Control Strategies ([advanced-witness-control.yml](./advanced-witness-control.yml))

This example shows multiple strategies for controlling witness attestation based on different conditions:

- **Environment variable control**: Use repository variables for manual control
- **Fork-aware**: Disable for pull requests from forks (where secrets aren't available)
- **Branch-specific**: Only enable for protected branches (main) and tags
- **Combined logic**: Mix multiple conditions for sophisticated control

## Common Use Cases

### Emergency Disable During Service Outage

When Fulcio, Rekor, or Archivista services experience outages:

1. Navigate to: Repository → Settings → Secrets and variables → Actions → Variables
2. Create or update `WITNESS_ENABLED` variable to `false`
3. Running and queued workflows will skip witness attestation
4. Once service is restored, set variable back to `true` or remove it

**No pull request or code deployment needed!**

### Disable for Development Branches

Only require attestation for production deployments:

```yaml
with:
  use-witness: ${{ github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/') }}
```

### Disable for External Contributors

Skip attestation for pull requests from forks (where secrets aren't accessible):

```yaml
with:
  use-witness: ${{ github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository }}
```

## Repository Variables vs Secrets

These examples use **repository variables** (not secrets) because:

- Variables are accessible in public repositories
- Variables can be easily viewed and modified by repository administrators
- The `use-witness` value is not sensitive information
- Variables are available in workflows from forks (with appropriate settings)

To create a repository variable:
1. Go to your repository on GitHub
2. Click Settings → Secrets and variables → Actions
3. Click the "Variables" tab
4. Click "New repository variable"
5. Add your variable name and value

## Best Practices

1. **Default to Enabled**: Structure your conditions so witness is enabled by default
   - ✅ `use-witness: ${{ vars.WITNESS_ENABLED != 'false' }}`
   - ❌ `use-witness: ${{ vars.WITNESS_ENABLED == 'true' }}`

2. **Document the Variable**: Add comments in your workflow explaining the escape valve

3. **Test Before Emergency**: Verify the disable mechanism works before you need it

4. **Consistent Naming**: Use the same variable name across all workflows for easy management

5. **Monitor and Alert**: Set up alerts for when witness is disabled to avoid forgetting to re-enable

## Troubleshooting

### Witness still runs when variable is set to "false"

- Check that you're using `vars.VARIABLE_NAME` (not `secrets.VARIABLE_NAME`)
- Verify the variable name matches exactly (case-sensitive)
- Ensure the comparison is correct: `!= 'false'` vs `== 'true'`

### Variable not found

- Variables must be created at the repository or organization level
- Check Settings → Secrets and variables → Actions → Variables
- For organization variables, ensure they're made available to the repository

## Additional Resources

- [GitHub Actions Variables Documentation](https://docs.github.com/en/actions/learn-github-actions/variables)
- [Witness Documentation](https://github.com/in-toto/witness)
- [witness-run-action README](../README.md)
