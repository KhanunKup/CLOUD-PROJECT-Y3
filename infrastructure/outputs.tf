output "region" {
  description = "AWS deployment region"
  value       = var.region
}

output "api_url" {
  description = "Base URL of the EasyDrive HTTP API"
  value       = module.api.invoke_url
}

output "storage_bucket" {
  description = "S3 bucket holding user files"
  value       = module.storage.bucket_name
}

output "sns_topic_arn" {
  description = "SNS topic for download and cost alerts"
  value       = module.notifications.topic_arn
}
