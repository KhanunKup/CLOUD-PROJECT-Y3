variable "region" {
  description = "AWS region. Learner Lab only allows us-east-1 and us-west-2."
  type        = string
  default     = "us-east-1"
}

variable "bucket_prefix" {
  description = "Prefix for S3 bucket names (lowercase). The data bucket is <prefix>-storage and is created by scripts/bootstrap.sh."
  type        = string
  default     = "easydrive-itkmitl-dev"
}

variable "alert_email" {
  description = "Email that receives SNS download and cost alarms. Empty disables the subscription."
  type        = string
  default     = ""
}

variable "api_throttle_burst" {
  description = "HTTP API stage burst limit (requests)."
  type        = number
  default     = 20
}

variable "api_throttle_rate" {
  description = "HTTP API stage steady-state limit (requests per second)."
  type        = number
  default     = 10
}

variable "invocation_alarm_threshold" {
  description = "Alarm when API Lambda invocations in 5 minutes exceed this."
  type        = number
  default     = 1000
}

variable "enable_budget" {
  description = "Create an AWS Budgets alert. Many Learner Lab accounts block budgets:CreateBudget, so it is off by default."
  type        = bool
  default     = false
}

variable "budget_usd" {
  description = "Monthly budget (USD) when enable_budget is true."
  type        = number
  default     = 10
}
