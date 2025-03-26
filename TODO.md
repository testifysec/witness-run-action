# witness-run-action Refactoring TODO List

This file outlines the key tasks for improving the witness-run-action codebase, focusing on aligning with GitHub Actions runner's behavior.

## High Priority Issues

### 1. Environment Variable Name Consistency

- [x] Fix environment variable handling to preserve hyphens (matches GitHub behavior)
- [x] Update tests to properly test with hyphenated input names
- [x] Create a centralized utility function for retrieving environment variables
- [x] Use consistent naming across all parts of the codebase

### 2. Boolean Input Handling

- [x] Fix boolean value preservation (maintain exact format rather than normalizing)
- [x] Add proper validation for boolean inputs according to YAML 1.2 Core Schema
- [x] Replace direct string comparisons with proper boolean parsing where appropriate
- [x] Document boolean behavior in code comments and documentation

### 3. Default Value Application

- [x] Consolidate default value handling to a single function/location
- [x] Ensure consistent behavior for required inputs (warnings vs errors)
- [x] Add tests for edge cases in default value handling

## Medium Priority Tasks

### 4. Logging Improvements

- [ ] Standardize on core.* functions for all logging
- [ ] Add consistent formatting for similar log messages
- [ ] Improve debugging output for input processing

### 5. Code Organization

- [ ] Extract utility functions into separate modules where appropriate
- [ ] Reduce code duplication between runner types
- [ ] Add better JSDoc comments for key functions

## Low Priority Enhancements

### 6. Error Handling

- [ ] Improve error messages to be more actionable
- [ ] Add consistent error handling patterns

### 7. Documentation

- [ ] Update README with clear examples
- [ ] Document differences in behavior between witness-run-action and GitHub Actions runner
- [ ] Add more detailed explanation of boolean input handling to documentation

## Guidelines for Implementation

1. **Simplicity First**: Prefer simple implementations over complex ones
2. **Test-Driven**: Add tests for any changes to verify behavior
3. **Backward Compatible**: Maintain compatibility with existing workflows
4. **Clean Code**: Focus on readability and maintainability
5. **No Over-Engineering**: Only add what's necessary to solve the immediate problems

## Next Steps

1. Implement the high priority items first
2. Add comprehensive tests for each change
3. Verify with real-world action examples
4. Update documentation to reflect changes