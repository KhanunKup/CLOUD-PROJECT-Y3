#!/usr/bin/env bash
# Tear everything down. Usage: scripts/destroy.sh [-y] [--purge]
#   -y        skip the confirmation prompt
#   --purge   also empty and delete the storage and state buckets (all uploaded files are lost)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require terraform
require aws

ASSUME_YES=0
PURGE=0
for arg in "$@"; do
  case "$arg" in
    -y) ASSUME_YES=1 ;;
    --purge) PURGE=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ "$ASSUME_YES" -ne 1 ]; then
  echo "This will destroy the EasyDrive stack in account $(aws sts get-caller-identity --query Account --output text) ($REGION)."
  [ "$PURGE" -eq 1 ] && echo "--purge: buckets ${STORAGE_BUCKET} and ${STATE_BUCKET} and ALL their objects will be deleted."
  read -r -p "Type 'destroy' to continue: " answer
  [ "$answer" = "destroy" ] || { echo "Aborted."; exit 1; }
fi

# Delete every object version and delete marker, then the bucket itself
purge_bucket() {
  local name="$1"
  bucket_exists "$name" || { echo "Bucket $name not found, skipping."; return; }
  echo "Emptying $name..."
  local payload
  while true; do
    payload="$(aws s3api list-object-versions --bucket "$name" --region "$REGION" --max-items 1000 \
      --query '{Objects: [].{Key: Key, VersionId: VersionId}}' --output json 2>/dev/null || true)"
    case "$payload" in
      ''|*'"Objects": null'*|*'"Objects": []'*) break ;;
    esac
    aws s3api delete-objects --bucket "$name" --region "$REGION" --delete "$payload" >/dev/null
  done
  aws s3api delete-bucket --bucket "$name" --region "$REGION"
  echo "Deleted $name."
}

cd "${INFRA_DIR}"
terraform init -input=false >/dev/null
terraform destroy -input=false -auto-approve \
  -var "region=${REGION}" -var "bucket_prefix=${PREFIX}"

if [ "$PURGE" -eq 1 ]; then
  purge_bucket "$STORAGE_BUCKET"
fi

echo "Done."
