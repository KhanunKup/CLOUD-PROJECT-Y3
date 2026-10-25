variable "region" {
  description = "Our AWS region for this project is us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "bucket_prefix" {
  description = "Prefix for S3 bucket names. Must be lowercase per AWS S3 rules."
  type        = string
  default     = "easydrive-itkmitl-dev"
}

variable "alert_email" {
  description = "Email address for SNS download notifications."
  type        = string
  default     = ""
}

variable "session_secret" {
  description = "Secret key for HMAC session cookie signing"
  type        = string
  default     = "easydrive-cloud-production-secret-key-kmitl"
  sensitive   = true
}
