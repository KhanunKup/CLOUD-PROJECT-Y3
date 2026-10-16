# 1. Package API Lambda Code (Express backend + EJS Views)
data "archive_file" "api_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/src/api"
  output_path = "${path.module}/api_function.zip"
}

# 2. Package Worker Lambda Code (S3 Event Hash & Tag Processor)
data "archive_file" "worker_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/src/worker"
  output_path = "${path.module}/worker_function.zip"
}

# 3. API Handler Lambda Function
resource "aws_lambda_function" "easydrive-api" {
  filename         = data.archive_file.api_zip.output_path
  function_name    = "easydrive-api-handler"
  role             = data.aws_iam_role.lab_role.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.api_zip.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      FILES_TABLE    = aws_dynamodb_table.easydrive-files.name
      SHARES_TABLE   = aws_dynamodb_table.easydrive-shares.name
      USERS_TABLE    = aws_dynamodb_table.easydrive-users.name
      STORAGE_BUCKET = aws_s3_bucket.easydrive-storage.id
      SNS_TOPIC_ARN  = aws_sns_topic.easydrive-download-alerts.arn
    }
  }

  tags = {
    Name        = "easydrive-api"
    Environment = "Dev"
  }
}

# 4. Background Worker Lambda Function (S3 Hash & Deduplication)
resource "aws_lambda_function" "easydrive-worker" {
  filename         = data.archive_file.worker_zip.output_path
  function_name    = "easydrive-worker-handler"
  role             = data.aws_iam_role.lab_role.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.worker_zip.output_base64sha256
  timeout          = 60

  environment {
    variables = {
      FILES_TABLE = aws_dynamodb_table.easydrive-files.name
      USERS_TABLE = aws_dynamodb_table.easydrive-users.name
    }
  }

  tags = {
    Name        = "easydrive-worker"
    Environment = "Dev"
  }
}

# Permission for S3 to invoke Worker Lambda
resource "aws_lambda_permission" "allow_s3_to_call_worker" {
  statement_id  = "AllowS3InvokeWorker"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.easydrive-worker.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.easydrive-storage.arn
}

# Permission for API Gateway to invoke API Lambda
resource "aws_lambda_permission" "allow_apigateway_to_call_api" {
  statement_id  = "AllowAPIGatewayInvokeAPI"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.easydrive-api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.easydrive-api.execution_arn}/*/*"
}

