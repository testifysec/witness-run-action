#!/bin/bash

# Script to monitor Docker action e2e tests
echo "Starting Docker action e2e test monitoring..."

# Get the most recent run ID
run_id=$(gh run list --workflow test-docker-action.yml --limit 1 --json databaseId --jq '.[0].databaseId')

if [ -z "$run_id" ]; then
  echo "No test runs found for Docker action workflow"
  exit 1
fi

echo "Monitoring run ID: $run_id"

# Monitor the run until it completes
status="in_progress"
while [ "$status" != "completed" ]; do
  sleep 5
  run_data=$(gh run view $run_id --json status,conclusion,jobs)
  status=$(echo "$run_data" | jq -r '.status')
  
  # Display current job status
  jobs=$(echo "$run_data" | jq -r '.jobs[] | .name + ": " + .status')
  echo "Current status: $status"
  echo "Jobs:"
  echo "$jobs"
  echo "----------------------------------------"
done

# Get final results
run_data=$(gh run view $run_id --json status,conclusion,jobs)
conclusion=$(echo "$run_data" | jq -r '.conclusion')
echo "Run completed with conclusion: $conclusion"

# Print job details
jobs=$(echo "$run_data" | jq -r '.jobs[] | "Job: " + .name + " - " + .conclusion')
echo "Job results:"
echo "$jobs"

# Create a summary issue if the run failed
if [ "$conclusion" != "success" ]; then
  echo "Test run failed, creating summary issue..."
  
  # Get logs for failed jobs
  failed_jobs=$(echo "$run_data" | jq -r '.jobs[] | select(.conclusion != "success") | .name')
  logs=""
  for job in $failed_jobs; do
    logs+="## Failed job: $job\n\n"
    logs+="Logs truncated, see the full logs in the GitHub Actions UI.\n\n"
  done
  
  # Create an issue with failure details
  gh issue create \
    --title "Docker Action E2E Tests Failed: Run $run_id" \
    --body "Docker action e2e tests failed on run $run_id at $(date).

## Failed Jobs
$failed_jobs

## Run Details
- Run ID: $run_id
- Conclusion: $conclusion
- Branch: $(git rev-parse --abbrev-ref HEAD)
- Commit: $(git rev-parse HEAD)

## Next Steps
1. Check the full logs in GitHub Actions UI
2. Fix the failing tests
3. Re-run the tests

[View Workflow Run](https://github.com/testifysec/witness-run-action/actions/runs/$run_id)"
    
  echo "Created summary issue for failed run"
else
  echo "All tests passed successfully!"
fi