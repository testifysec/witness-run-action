# Nested Composite Actions Support Specification

## Overview
This document outlines the requirements and implementation plan for adding support for nested composite actions in the `witness-run-action` GitHub Action. A nested composite action is a composite action that uses another action via the `uses` keyword in its steps.

## Current Limitations
Currently, our composite action implementation:
1. Supports executing shell commands with `run` steps
2. Processes input variables and environment variables
3. Captures and processes outputs between steps
4. Handles GitHub expressions for inputs, outputs, and basic context values

However, it does not support:
1. Executing other actions via the `uses` keyword in a composite action step
2. Nested composite actions (composite actions that use other composite actions)

## Requirements for Nested Actions Support

### 1. `uses` Step Handling
- Support for `uses` steps within composite actions
- Identify action references in the format:
  - `{owner}/{repo}@{ref}` for GitHub-hosted actions
  - `{owner}/{repo}/{path}@{ref}` for actions in a subdirectory
  - `./{path}` for local actions in the same repository
  - `docker://{image}:{tag}` for Docker actions

### 2. Action Resolution
- Clone/download external actions when specified with a repository reference
- Locate local actions when using relative paths
- Support for nested composite actions (composite actions that invoke other composite actions)

### 3. Action Execution
- Parse and execute the referenced action based on its type (JavaScript, Docker, or composite)
- Properly handle inputs passed to the nested action
- Capture and propagate outputs from the nested action to the parent action
- Maintain proper environment variable context between action executions

### 4. Implementation Scope - Phase 1
For the initial implementation, we will focus on:
- Support for `uses` steps that reference composite actions
- Support for `./{path}` format for local composite actions
- Support for `{owner}/{repo}@{ref}` format for GitHub-hosted composite actions
- Basic input and output passing between parent and nested actions
- Nested composite action execution with proper step context

### 5. Future Considerations (Phase 2)
- Support for Docker-based actions in composite actions
- More advanced GitHub expression handling
- Conditional step execution based on `if` conditions
- Path manipulation and working directory handling
- Support for non-bash shells

## Implementation Plan

### 1. Action Resolution and Execution Process

1. When a `uses` step is encountered in a composite action:
   - Determine the action type (local vs. GitHub-hosted)
   - For GitHub-hosted actions, download the action using existing `downloadAndSetupAction` function
   - For local actions, resolve the path relative to the parent action directory

2. Parse the action's metadata:
   - Load the action.yml or action.yaml file
   - Determine the action type (JavaScript, Docker, or composite)
   - Process inputs, mapping parent inputs to child inputs

3. Execute the action based on its type:
   - For JavaScript actions, use existing `runJsActionWithWitness`
   - For composite actions, use `runCompositeActionWithWitness` with nested context
   - Capture outputs and make them available to subsequent steps

4. Clean up temporary files and directories after execution

### 2. Proposed Code Structure Changes

1. Add a new function `executeCompositeUsesStep` to handle steps with `uses` keyword
2. Enhance `runCompositeActionWithWitness` to handle `uses` steps by calling the new function
3. Add action resolution logic to determine action location and type
4. Implement proper handling of input and output variables between nested actions
5. Add proper context maintenance to ensure GitHub expressions work across nested executions

### 3. Testing Strategy

We will create tests that:
1. Test local composite action nesting (using `./.github/actions/...` syntax)
2. Test a composite action that uses a GitHub-hosted composite action
3. Test multi-level nesting (a composite action that uses another composite action that uses a third action)
4. Test input passing between nested actions
5. Test output propagation between nested actions

## Implementation Notes

- We'll need to be careful with environment variables to ensure they don't leak between actions
- GitHub context values must be maintained and properly passed between nested actions
- File paths and working directories need special handling for script execution
- The implementation must work within the constraints of the existing witness attestation flow