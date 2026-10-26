#!/usr/bin/env bash
# Build the API bundle and apply the Terraform stack. Usage: scripts/deploy.sh [terraform apply args]
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require terraform
require npm

echo "Installing production dependencies for the API Lambda..."
( cd "${ROOT_DIR}/backend/src/api" && npm ci --omit=dev --no-audit --no-fund )

cd "${INFRA_DIR}"
terraform init -input=false
terraform apply -input=false \
  -var "region=${REGION}" -var "bucket_prefix=${PREFIX}" "$@"

echo
echo "API URL: $(terraform output -raw api_url)"
echo "Remember to run scripts/destroy.sh when you finish; Learner Lab keeps billing after a session ends."
