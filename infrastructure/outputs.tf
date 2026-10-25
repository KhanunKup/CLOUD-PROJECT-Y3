output "region" {
  description = "AWS Deployment Region"
  value       = var.region
}

# S3 Outputs
output "easydrive-host-bucket" {
  description = "S3 bucket name for hosting static assets (CSS, JS, Fonts, Images)"
  value       = aws_s3_bucket.easydrive-host.id
}

output "easydrive-host-website-url" {
  description = "URL endpoint for S3 Static Assets Hosting"
  value       = aws_s3_bucket_website_configuration.easydrive-host-website.website_endpoint
}

output "easydrive-storage-bucket" {
  description = "S3 bucket name for private user file storage"
  value       = aws_s3_bucket.easydrive-storage.id
}

# API Gateway Output
output "api-gateway-url" {
  description = "Base URL for EasyDrive HTTP API (Zero Stage Prefix)"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

# SNS Output
output "sns-topic-arn" {
  description = "ARN for SNS Download Alerts Topic"
  value       = aws_sns_topic.easydrive-download-alerts.arn
}
