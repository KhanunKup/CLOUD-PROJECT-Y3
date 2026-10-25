# The bucket itself is created by scripts/bootstrap.sh: Learner Lab SCPs block the
# s3:GetBucketObjectLockConfiguration call that aws_s3_bucket makes on refresh.
# There is deliberately no aws_s3_bucket_notification: nothing is triggered by uploads.
variable "bucket_name" {
  type = string
}

data "aws_s3_bucket" "storage" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "storage" {
  bucket = data.aws_s3_bucket.storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "storage" {
  bucket = data.aws_s3_bucket.storage.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "storage" {
  bucket = data.aws_s3_bucket.storage.id

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

output "bucket_name" {
  value = data.aws_s3_bucket.storage.id
}

output "bucket_arn" {
  value = data.aws_s3_bucket.storage.arn
}
