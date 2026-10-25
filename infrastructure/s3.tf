# Reference existing S3 Bucket (avoids SCP s3:GetBucketObjectLockConfiguration restriction in AWS Academy)
data "aws_s3_bucket" "easydrive-storage" {
  bucket = "${var.bucket_prefix}-storage"
}

# Block all public access for storage bucket (Private Zone)
resource "aws_s3_bucket_public_access_block" "easydrive-storage-privacy" {
  bucket = data.aws_s3_bucket.easydrive-storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning for point-in-time recovery
resource "aws_s3_bucket_versioning" "easydrive-storage-versioning" {
  bucket = data.aws_s3_bucket.easydrive-storage.id

  versioning_configuration {
    status = "Suspended"
  }
}

# CORS Configuration for direct browser upload via Presigned URLs
resource "aws_s3_bucket_cors_configuration" "easydrive-storage-cors" {
  bucket = data.aws_s3_bucket.easydrive-storage.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# S3 Lifecycle Rule: Expire noncurrent versions after 30 days & clean incomplete uploads
resource "aws_s3_bucket_lifecycle_configuration" "easydrive-storage-lifecycle" {
  bucket = data.aws_s3_bucket.easydrive-storage.id

  rule {
    id     = "expire-noncurrent-versions-and-abort-uploads"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# S3 Event Notification to trigger Worker Lambda on file upload
resource "aws_s3_bucket_notification" "easydrive-storage-notification" {
  bucket = data.aws_s3_bucket.easydrive-storage.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.easydrive-worker.arn
    events              = ["s3:ObjectCreated:Put", "s3:ObjectCreated:CompleteMultipartUpload"]
    filter_prefix       = "uploads/"
  }

  depends_on = [aws_lambda_permission.allow_s3_to_call_worker]
}
