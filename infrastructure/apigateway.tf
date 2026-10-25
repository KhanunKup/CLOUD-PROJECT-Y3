# REST API Gateway
resource "aws_api_gateway_rest_api" "easydrive-api" {
  name        = "easydrive-api"
  description = "EasyDrive REST API Gateway"

  binary_media_types = [
    "*/*"
  ]

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name        = "easydrive-api-gateway"
    Environment = "Dev"
  }
}

# 1. Greedy Proxy Resource: /{proxy+}
resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.easydrive-api.id
  parent_id   = aws_api_gateway_rest_api.easydrive-api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy" {
  rest_api_id   = aws_api_gateway_rest_api.easydrive-api.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda_proxy" {
  rest_api_id             = aws_api_gateway_rest_api.easydrive-api.id
  resource_id             = aws_api_gateway_resource.proxy.id
  http_method             = aws_api_gateway_method.proxy.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.easydrive-api.invoke_arn
}

# 2. Root Resource: /
resource "aws_api_gateway_method" "proxy_root" {
  rest_api_id   = aws_api_gateway_rest_api.easydrive-api.id
  resource_id   = aws_api_gateway_rest_api.easydrive-api.root_resource_id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda_root" {
  rest_api_id             = aws_api_gateway_rest_api.easydrive-api.id
  resource_id             = aws_api_gateway_rest_api.easydrive-api.root_resource_id
  http_method             = aws_api_gateway_method.proxy_root.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.easydrive-api.invoke_arn
}

# 3. Deployment & Stage
resource "aws_api_gateway_deployment" "easydrive" {
  rest_api_id = aws_api_gateway_rest_api.easydrive-api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.proxy.id,
      aws_api_gateway_method.proxy.id,
      aws_api_gateway_integration.lambda_proxy.id,
      aws_api_gateway_method.proxy_root.id,
      aws_api_gateway_integration.lambda_root.id
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.lambda_proxy,
    aws_api_gateway_integration.lambda_root
  ]
}

resource "aws_api_gateway_stage" "dev" {
  deployment_id = aws_api_gateway_deployment.easydrive.id
  rest_api_id   = aws_api_gateway_rest_api.easydrive-api.id
  stage_name    = "dev"
}
