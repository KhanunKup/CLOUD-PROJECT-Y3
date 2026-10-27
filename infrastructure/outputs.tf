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

#output "sns_topic_arn" {
#  description = "SNS topic for download and cost alerts"
#  value       = module.notifications.topic_arn
#}

output "cloudwatch_dashboard_name" {
  description = "Name of the operational CloudWatch dashboard."
  value       = module.alerts.dashboard_name
}

output "cloudwatch_dashboard_url" {
  description = "Direct URL to open the CloudWatch dashboard in AWS Management Console."
  value       = module.alerts.dashboard_url
}
