# Default Values Test Action

This action is used to verify that default values from `action.yml` are correctly passed to the wrapped action when using the witness-run-action.

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `string-input` | A string input with default value | `default string value` |
| `boolean-input` | A boolean input with default false | `false` |
| `boolean-input-true` | A boolean input with default true | `true` |
| `number-input` | A number input with default value | `42` |
| `required-input` | A required input with no default | (required) |

## Outputs

| Output | Description |
|--------|-------------|
| `string-input-received` | The value of string-input as received by the action |
| `boolean-input-received` | The value of boolean-input as received by the action |
| `boolean-input-true-received` | The value of boolean-input-true as received by the action |
| `number-input-received` | The value of number-input as received by the action |
| `required-input-received` | The value of required-input as received by the action |

## How it works

1. The action logs all input values it receives
2. It verifies that boolean inputs are properly converted to boolean types
3. It creates a summary table showing expected vs. received values
4. It sets outputs that can be checked by the workflow

This action is used in CI to verify that default values are properly passed from the wrapped action's `action.yml` file to the actual action code.