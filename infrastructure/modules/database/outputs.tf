output "files_table" {
  value = aws_dynamodb_table.files.name
}

output "shares_table" {
  value = aws_dynamodb_table.shares.name
}

output "users_table" {
  value = aws_dynamodb_table.users.name
}

output "files_ttl_attribute" {
  value = one(aws_dynamodb_table.files.ttl).attribute_name
}

output "billing_modes" {
  value = [
    aws_dynamodb_table.files.billing_mode,
    aws_dynamodb_table.shares.billing_mode,
    aws_dynamodb_table.users.billing_mode,
  ]
}
