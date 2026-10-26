resource "aws_dynamodb_table" "files" {
  name         = "easydrive-files"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "file_id"

  attribute {
    name = "file_id"
    type = "S"
  }

  attribute {
    name = "owner_id"
    type = "S"
  }

  attribute {
    name = "folder_id"
    type = "S"
  }

  global_secondary_index {
    name            = "OwnerIndex"
    hash_key        = "owner_id"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "OwnerFolderIndex"
    hash_key        = "owner_id"
    range_key       = "folder_id"
    projection_type = "ALL"
  }

  # Abandoned pending uploads and password-reset tokens both carry expires_at (epoch seconds)
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "shares" {
  name         = "easydrive-shares"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "share_id"

  attribute {
    name = "share_id"
    type = "S"
  }

  attribute {
    name = "file_id"
    type = "S"
  }

  attribute {
    name = "owner_id"
    type = "S"
  }

  global_secondary_index {
    name            = "FileIdIndex"
    hash_key        = "file_id"
    projection_type = "ALL"
  }

  # Replaces full-table Scans for the drive and shared pages
  global_secondary_index {
    name            = "OwnerIndex"
    hash_key        = "owner_id"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "easydrive-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "username"
    type = "S"
  }

  global_secondary_index {
    name            = "EmailIndex"
    hash_key        = "email"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "UsernameIndex"
    hash_key        = "username"
    projection_type = "ALL"
  }
}
