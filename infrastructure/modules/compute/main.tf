variable "source_dir" {
  type = string
}

variable "build_dir" {
  type = string
}

variable "environment" {
  type = map(string)
}

variable "memory_size" {
  type    = number
  default = 256
}

variable "timeout" {
  type    = number
  default = 15
}

variable "log_retention_days" {
  type    = number
  default = 1
}

data "aws_iam_role" "lab_role" {
  name = "LabRole"
}

# @aws-sdk/* ships with the nodejs22.x runtime, so it stays out of the zip
data "archive_file" "api" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${var.build_dir}/api.zip"
  excludes    = ["node_modules/@aws-sdk", "node_modules/@smithy", "node_modules/.package-lock.json", "test"]
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/easydrive-api-handler"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "easydrive-api-handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  role             = data.aws_iam_role.lab_role.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  memory_size      = var.memory_size
  timeout          = var.timeout

  # No reserved_concurrent_executions: Learner Lab accounts have a low account-level limit
  # and a reservation can make apply fail or starve the API.

  environment {
    variables = var.environment
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

output "function_name" {
  value = aws_lambda_function.api.function_name
}

output "invoke_arn" {
  value = aws_lambda_function.api.invoke_arn
}

output "memory_size" {
  value = aws_lambda_function.api.memory_size
}

output "timeout" {
  value = aws_lambda_function.api.timeout
}

output "reserved_concurrency" {
  value = aws_lambda_function.api.reserved_concurrent_executions
}

output "log_retention_days" {
  value = aws_cloudwatch_log_group.api.retention_in_days
}
