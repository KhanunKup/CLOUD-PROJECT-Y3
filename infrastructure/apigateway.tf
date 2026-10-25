# Modern AWS API Gateway HTTP API (v2) with $default auto-deploy stage
# Eliminates /dev from the path entirely: URLs are clean (e.g. /login, /drive, /api/files)
resource "aws_apigatewayv2_api" "easydrive-api" {
  name          = "easydrive-api"
  protocol_type = "HTTP"
  description   = "EasyDrive Serverless HTTP API (Zero Stage Prefix)"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
    allow_headers = ["*"]
    max_age       = 3000
  }

  tags = {
    Name        = "easydrive-api"
    Environment = "Dev"
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.easydrive-api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.easydrive-api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.easydrive-api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.easydrive-api.id
  name        = "$default"
  auto_deploy = true

  tags = {
    Name        = "easydrive-default-stage"
    Environment = "Dev"
  }
}
