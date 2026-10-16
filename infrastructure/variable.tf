variable "region" {
  description = "Our AWS region for this project is us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "bucket_prefix" {
  description = "Prefix for S3 bucket names. Must be lowercase per AWS S3 rules."
  type        = string
  default     = "easydrive-itkmitl"
}

variable "alert_email" {
  description = "Email address for SNS download notifications."
  type        = string
  default     = ""
}