output "region" {
  description = "AWS Deployment Region"
  value       = var.region
}

# S3 Output
output "easydrive-storage-bucket" {
  description = "S3 bucket name for private user file storage"
  value       = data.aws_s3_bucket.easydrive-storage.id
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
