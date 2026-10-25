#!/usr/bin/env bash
# Shared settings for bootstrap/deploy/destroy. Override by exporting the variable first.

PREFIX="${PREFIX:-easydrive-itkmitl-dev}"
REGION="${REGION:-us-east-1}"
STATE_BUCKET="${PREFIX}-tfstate"
STORAGE_BUCKET="${PREFIX}-storage"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="${ROOT_DIR}/infrastructure"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' is required but not installed." >&2; exit 1; }
}

bucket_exists() {
  aws s3api head-bucket --bucket "$1" --region "$REGION" >/dev/null 2>&1
}
