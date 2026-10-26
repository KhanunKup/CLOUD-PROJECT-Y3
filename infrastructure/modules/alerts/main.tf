variable "topic_arn" {
  type    = string
  default = ""
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

# Tripwires only: monitors metrics on CloudWatch Dashboard
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
  # alarm_actions     = [var.topic_arn]
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
  # alarm_actions     = [var.topic_arn]
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
  # alarm_actions     = [var.topic_arn]
}

output "alarm_names" {
  value = [
    aws_cloudwatch_metric_alarm.lambda_invocations.alarm_name,
    aws_cloudwatch_metric_alarm.lambda_errors.alarm_name,
    aws_cloudwatch_metric_alarm.api_requests.alarm_name,
  ]
}