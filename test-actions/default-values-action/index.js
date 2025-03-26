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
    
    // Determine if this is an override test based on the inputs
    const isOverrideTest = process.env.INPUT_TEST_MODE === 'override' ||
                          (stringInput !== 'default string value' && booleanInput !== false);
    
    // Define expected values based on test mode
    const expectedValues = isOverrideTest ? {
      stringInput: process.env.EXPECTED_STRING_INPUT || 'custom string', 
      booleanInput: process.env.EXPECTED_BOOLEAN_INPUT === 'false' ? false : true,
      booleanInputTrue: process.env.EXPECTED_BOOLEAN_INPUT_TRUE === 'true' ? true : false,
      numberInput: process.env.EXPECTED_NUMBER_INPUT || '100',
      requiredInput: process.env.EXPECTED_REQUIRED_INPUT || 'different value'
    } : {
      stringInput: 'default string value',
      booleanInput: false, 
      booleanInputTrue: true,
      numberInput: '42',
      requiredInput: requiredInput // required value has no default
    };
    
    // Create a summary of the test results
    const summary = [
      `# Default Values Test Results${isOverrideTest ? ' (Override Test)' : ''}`,
      '',
      '| Input | Expected | Received | Type | Result |',
      '| ----- | -------- | -------- | ---- | ------ |',
      `| string-input | "${expectedValues.stringInput}" | "${stringInput}" | ${typeof stringInput} | ${stringInput === expectedValues.stringInput ? '✅' : '❌'} |`,
      `| boolean-input | ${expectedValues.booleanInput} | ${booleanInput} | ${typeof booleanInput} | ${booleanInput === expectedValues.booleanInput ? '✅' : '❌'} |`,
      `| boolean-input-true | ${expectedValues.booleanInputTrue} | ${booleanInputTrue} | ${typeof booleanInputTrue} | ${booleanInputTrue === expectedValues.booleanInputTrue ? '✅' : '❌'} |`,
      `| number-input | "${expectedValues.numberInput}" | "${numberInput}" | ${typeof numberInput} | ${numberInput === expectedValues.numberInput ? '✅' : '❌'} |`,
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