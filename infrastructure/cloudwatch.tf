# CloudWatch Log Group for API Lambda
resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/lambda/easydrive-api-handler"
  retention_in_days = 7

  tags = {
    Name        = "easydrive-api-logs"
    Environment = "Dev"
  }
}

# CloudWatch Log Group for Worker Lambda
resource "aws_cloudwatch_log_group" "worker_logs" {
  name              = "/aws/lambda/easydrive-worker-handler"
  retention_in_days = 7

  tags = {
    Name        = "easydrive-worker-logs"
    Environment = "Dev"
  }
}

