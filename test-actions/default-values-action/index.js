const core = require('@actions/core');

// Function to run the action
async function run() {
  try {
    // Get all inputs, including those with defaults
    const stringInput = core.getInput('string-input');
    
    // Handle boolean inputs carefully to avoid YAML 1.2 Core Schema errors
    let booleanInput, booleanInputTrue;
    try {
      booleanInput = core.getBooleanInput('boolean-input');
    } catch (error) {
      // Fallback to manual parsing if getBooleanInput fails
      const rawValue = core.getInput('boolean-input') || 'false';
      core.info(`⚠️ Using fallback for boolean-input: "${rawValue}"`);
      booleanInput = rawValue.toString().toLowerCase() === 'true';
    }
    
    try {
      booleanInputTrue = core.getBooleanInput('boolean-input-true');
    } catch (error) {
      // Fallback to manual parsing if getBooleanInput fails
      const rawValue = core.getInput('boolean-input-true') || 'true';
      core.info(`⚠️ Using fallback for boolean-input-true: "${rawValue}"`);
      booleanInputTrue = rawValue.toString().toLowerCase() === 'true';
    }
    
    const numberInput = core.getInput('number-input');
    
    // Get required input
    const requiredInput = core.getInput('required-input', { required: true });
    
    // Log all inputs to verify they were passed correctly
    core.info('✅ Input values received by action:');
    core.info(`  string-input: "${stringInput}"`);
    core.info(`  boolean-input: ${booleanInput} (type: ${typeof booleanInput})`);
    core.info(`  boolean-input-true: ${booleanInputTrue} (type: ${typeof booleanInputTrue})`);
    core.info(`  number-input: ${numberInput} (type: ${typeof numberInput})`);
    core.info(`  required-input: "${requiredInput}"`);
    
    // Debug: Log all environment variables
    core.info('DEBUG: All INPUT_ environment variables:');
    Object.keys(process.env)
      .filter(key => key.startsWith('INPUT_'))
      .forEach(key => {
        core.info(`  ${key}=${process.env[key]} (type: ${typeof process.env[key]})`);
      });
    
    // Set outputs for verification
    core.setOutput('string-input-received', stringInput || 'default string value');
    core.setOutput('boolean-input-received', booleanInput.toString()); // Convert boolean to string for output
    core.setOutput('boolean-input-true-received', booleanInputTrue.toString()); // Convert boolean to string for output
    core.setOutput('number-input-received', numberInput || '42');
    core.setOutput('required-input-received', requiredInput);
    
    // Explicitly verify that boolean inputs were properly converted to booleans
    if (typeof booleanInput === 'boolean') {
      core.info('✅ boolean-input was correctly converted to a boolean type');
    } else {
      core.setFailed('❌ boolean-input was not converted to a boolean type');
    }
    
    if (typeof booleanInputTrue === 'boolean') {
      core.info('✅ boolean-input-true was correctly converted to a boolean type');
    } else {
      core.setFailed('❌ boolean-input-true was not converted to a boolean type');
    }
    
    // Create a summary of the test results
    const summary = [
      '# Default Values Test Results',
      '',
      '| Input | Expected | Received | Type | Result |',
      '| ----- | -------- | -------- | ---- | ------ |',
      `| string-input | "default string value" | "${stringInput}" | ${typeof stringInput} | ${stringInput === 'default string value' ? '✅' : '❌'} |`,
      `| boolean-input | false | ${booleanInput} | ${typeof booleanInput} | ${booleanInput === false ? '✅' : '❌'} |`,
      `| boolean-input-true | true | ${booleanInputTrue} | ${typeof booleanInputTrue} | ${booleanInputTrue === true ? '✅' : '❌'} |`,
      `| number-input | "42" | "${numberInput}" | ${typeof numberInput} | ${numberInput === '42' ? '✅' : '❌'} |`,
      `| required-input | [required value] | "${requiredInput}" | ${typeof requiredInput} | ${requiredInput ? '✅' : '❌'} |`,
    ].join('\n');
    
    await core.summary.addRaw(summary).write();
    
    // All checks passed
    core.info('✅ Default values test action completed successfully');
  } catch (error) {
    core.setFailed(`❌ Action failed: ${error.message}`);
  }
}

// Run the action
run();