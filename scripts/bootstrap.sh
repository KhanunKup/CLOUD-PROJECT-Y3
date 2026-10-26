#!/usr/bin/env bash
# One-time setup per Learner Lab account: creates the storage S3 bucket.
# Safe to re-run. The data bucket is created here (not in Terraform) because Learner Lab SCPs block
# the s3:GetBucketObjectLockConfiguration call that aws_s3_bucket makes.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require aws

echo "Checking AWS credentials..."
aws sts get-caller-identity --query Account --output text >/dev/null \
  || { echo "ERROR: no valid AWS credentials. Paste the Learner Lab 'AWS CLI' block into ~/.aws/credentials first." >&2; exit 1; }

create_bucket() {
  local name="$1"
  if bucket_exists "$name"; then
    echo "Bucket $name already exists."
    return
  fi
  echo "Creating bucket $name in $REGION..."
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$name" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$name" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
}

create_bucket "$STORAGE_BUCKET"

echo "Bootstrap complete. Storage bucket is ready. Next: scripts/deploy.sh"
