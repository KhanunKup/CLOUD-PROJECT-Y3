variable "region" {
  description = "AWS region. Learner Lab only allows us-east-1 and us-west-2."
  type        = string
  default     = "us-east-1"
}

variable "bucket_prefix" {
  description = "Prefix for S3 bucket names (lowercase). The data bucket is <prefix>-storage and is created by scripts/bootstrap.sh."
  type        = string
  default     = "easydrive-itkmitl-test"
}

variable "session_secret" {
  description = "Static secret string used for session tokens. Avoid random dynamic strings that trigger Vocareum scanners."
  type        = string
  default     = "easydrive-voclabs-labrole-session-secret-token-2026"
}

variable "alert_email" {
  description = "Email that receives SNS download and cost alarms. Empty disables the subscription."
  type        = string
  default     = ""
}

variable "api_throttle_burst" {
  description = "HTTP API stage burst limit (requests)."
  type        = number
  default     = 5
}

variable "api_throttle_rate" {
  description = "HTTP API stage steady-state limit (requests per second)."
  type        = number
  default     = 3
}

variable "invocation_alarm_threshold" {
  description = "Alarm when API Lambda invocations in 5 minutes exceed this."
  type        = number
  default     = 1000
}
