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

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "dashboard_name" {
  type    = string
  default = "easydrive-dashboard"
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

# Essential CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = var.dashboard_name

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "alarm"
        x      = 0
        y      = 0
        width  = 24
        height = 3
        properties = {
          title  = "EasyDrive Active Alarms"
          alarms = [
            aws_cloudwatch_metric_alarm.lambda_invocations.arn,
            aws_cloudwatch_metric_alarm.lambda_errors.arn,
            aws_cloudwatch_metric_alarm.api_requests.arn
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 3
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiId", var.api_id, { stat = "Sum", label = "API Requests", color = "#1f77b4" }],
            ["AWS/ApiGateway", "4xx", "ApiId", var.api_id, { stat = "Sum", label = "Client Errors (4xx)", color = "#ff7f0e" }],
            ["AWS/ApiGateway", "5xx", "ApiId", var.api_id, { stat = "Sum", label = "Server Errors (5xx)", color = "#d62728" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "API Gateway: Requests & Errors"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 3
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", var.lambda_function_name, { stat = "Sum", label = "Lambda Invocations", color = "#2ca02c" }],
            ["AWS/Lambda", "Errors", "FunctionName", var.lambda_function_name, { stat = "Sum", label = "Lambda Errors", color = "#d62728" }],
            ["AWS/Lambda", "Throttles", "FunctionName", var.lambda_function_name, { stat = "Sum", label = "Throttles", color = "#9467bd" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Lambda: Invocations, Errors & Throttles"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 9
        width  = 24
        height = 6
        properties = {
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", var.lambda_function_name, { stat = "Average", label = "Average Duration (ms)", color = "#17becf" }],
            ["AWS/Lambda", "Duration", "FunctionName", var.lambda_function_name, { stat = "p95", label = "p95 Duration (ms)", color = "#bcbd22" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Lambda: Execution Duration (Latency)"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      }
    ]
  })
}

output "alarm_names" {
  value = [
    aws_cloudwatch_metric_alarm.lambda_invocations.alarm_name,
    aws_cloudwatch_metric_alarm.lambda_errors.alarm_name,
    aws_cloudwatch_metric_alarm.api_requests.alarm_name,
  ]
}

output "dashboard_name" {
  description = "Name of the CloudWatch Dashboard"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "dashboard_url" {
  description = "Direct AWS Console URL to the CloudWatch Dashboard"
  value       = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards/dashboard/${aws_cloudwatch_dashboard.main.dashboard_name}"
}
