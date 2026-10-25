variable "topic_arn" {
  type = string
}

variable "lambda_function_name" {
  type = string
}

variable "api_id" {
  type = string
}

variable "invocation_threshold" {
  type = number
}

variable "enable_budget" {
  type    = bool
  default = false
}

variable "budget_usd" {
  type    = number
  default = 10
}

variable "alert_email" {
  type    = string
  default = ""
}

# Tripwires only: they notify, they never shut anything down
resource "aws_cloudwatch_metric_alarm" "lambda_invocations" {
  alarm_name          = "easydrive-api-invocations-spike"
  namespace           = "AWS/Lambda"
  metric_name         = "Invocations"
  dimensions          = { FunctionName = var.lambda_function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.invocation_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "easydrive-api-errors-spike"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = var.lambda_function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 20
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "api_requests" {
  alarm_name          = "easydrive-api-requests-spike"
  namespace           = "AWS/ApiGateway"
  metric_name         = "Count"
  dimensions          = { ApiId = var.api_id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.invocation_threshold * 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.topic_arn]
}

# Off by default: AWS Academy accounts commonly deny budgets:CreateBudget
resource "aws_budgets_budget" "monthly" {
  count        = var.enable_budget ? 1 : 0
  name         = "easydrive-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = var.alert_email != "" ? [50, 80, 100] : []
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
  }
}

output "budget_count" {
  value = length(aws_budgets_budget.monthly)
}

output "alarm_names" {
  value = [
    aws_cloudwatch_metric_alarm.lambda_invocations.alarm_name,
    aws_cloudwatch_metric_alarm.lambda_errors.alarm_name,
    aws_cloudwatch_metric_alarm.api_requests.alarm_name,
  ]
}
