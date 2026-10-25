variable "lambda_invoke_arn" {
  type = string
}

variable "lambda_function_name" {
  type = string
}

variable "throttle_burst" {
  type = number
}

variable "throttle_rate" {
  type = number
}

resource "aws_apigatewayv2_api" "this" {
  name          = "easydrive-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
    allow_headers = ["*"]
    max_age       = 3000
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = var.lambda_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  # Hard ceiling on request volume: a runaway client or bot cannot fan out into Lambda invocations
  default_route_settings {
    throttling_burst_limit = var.throttle_burst
    throttling_rate_limit  = var.throttle_rate
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvokeAPI"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

output "invoke_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "api_id" {
  value = aws_apigatewayv2_api.this.id
}

output "throttling_burst_limit" {
  value = aws_apigatewayv2_stage.default.default_route_settings[0].throttling_burst_limit
}

output "throttling_rate_limit" {
  value = aws_apigatewayv2_stage.default.default_route_settings[0].throttling_rate_limit
}
