# 1. S3 Bucket for Static Assets (CSS, JS, Fonts, Images for EJS Frontend)
resource "aws_s3_bucket" "easydrive-host" {
  bucket = "${var.bucket_prefix}-host"

  tags = {
    Name        = "easydrive-assets-host"
    Environment = "Dev"
  }
}

resource "aws_s3_bucket_website_configuration" "easydrive-host-website" {
  bucket = aws_s3_bucket.easydrive-host.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# 2. S3 Bucket for User File Storage (Private & Secure)
resource "aws_s3_bucket" "easydrive-storage" {
  bucket = "${var.bucket_prefix}-storage"

  tags = {
    Name        = "easydrive-file-storage"
    Environment = "Dev"
  }
}

# Block all public access for storage bucket (Private Zone)
resource "aws_s3_bucket_public_access_block" "easydrive-storage-privacy" {
  bucket = aws_s3_bucket.easydrive-storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning for point-in-time recovery
resource "aws_s3_bucket_versioning" "easydrive-storage-versioning" {
  bucket = aws_s3_bucket.easydrive-storage.id

  versioning_configuration {
    status = "Enabled"
  }
}

# CORS Configuration for direct browser upload via Presigned URLs
resource "aws_s3_bucket_cors_configuration" "easydrive-storage-cors" {
  bucket = aws_s3_bucket.easydrive-storage.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# S3 Lifecycle Rule: Clean up files in trash/ after 30 days
resource "aws_s3_bucket_lifecycle_configuration" "easydrive-storage-lifecycle" {
  bucket = aws_s3_bucket.easydrive-storage.id

  rule {
    id     = "delete-trash-after-30-days"
    status = "Enabled"

    filter {
      prefix = "trash/"
    }

    expiration {
      days = 30
    }
  }
}

# S3 Event Notification to trigger Worker Lambda on file upload
resource "aws_s3_bucket_notification" "easydrive-storage-notification" {
  bucket = aws_s3_bucket.easydrive-storage.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.easydrive-worker.arn
    events              = ["s3:ObjectCreated:*"]
  }

  depends_on = [aws_lambda_permission.allow_s3_to_call_worker]
}
