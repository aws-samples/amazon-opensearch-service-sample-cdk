#!/usr/bin/env bash
# deploy.sh — Build and deploy OpenSearch infrastructure via CDK.
#
# Usage:
#   ./deploy.sh --context-file config/dev.json
#   ./deploy.sh --context-file config/prod.json --dry-run
#
# Options:
#   --context-file      Required. Path to a JSON config file (must contain "stage").
#   --dry-run           Optional. Run cdk diff instead of cdk deploy.
#   --require-approval  Optional. CDK approval level (default: broadening).
#   -h, --help          Show this help message.

set -euo pipefail

CONTEXT_FILE=""
DRY_RUN=false
REQUIRE_APPROVAL="broadening"

usage() {
  sed -n '2,/^$/s/^# \?//p' "$0"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context-file)     CONTEXT_FILE="$2"; shift 2 ;;
    --dry-run)          DRY_RUN=true; shift ;;
    --require-approval) REQUIRE_APPROVAL="$2"; shift 2 ;;
    -h|--help)          usage ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$CONTEXT_FILE" ]]; then
  echo "Error: --context-file is required" >&2
  echo "Usage: ./deploy.sh --context-file <path-to-config.json>" >&2
  exit 1
fi

if [[ ! -f "$CONTEXT_FILE" ]]; then
  echo "Error: context file not found: $CONTEXT_FILE" >&2
  exit 1
fi

# Build
echo "Building..."
npm run build

# Assemble CDK context args
CDK_ARGS=(-c "contextFile=$CONTEXT_FILE")

if [[ "$DRY_RUN" == true ]]; then
  echo "Running cdk diff (dry run)..."
  npx cdk diff "${CDK_ARGS[@]}"
else
  echo "Deploying..."
  npx cdk deploy "${CDK_ARGS[@]}" --require-approval "$REQUIRE_APPROVAL"
fi
