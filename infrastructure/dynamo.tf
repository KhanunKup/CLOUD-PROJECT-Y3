# 1. Table for File Metadata & Deduplication Hash
resource "aws_dynamodb_table" "easydrive-files" {
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
    name = "file_hash"
    type = "S"
  }

  attribute {
    name = "folder_id"
    type = "S"
  }

  # Index to list files belonging to a specific user
  global_secondary_index {
    name            = "OwnerIndex"
    hash_key        = "owner_id"
    projection_type = "ALL"
  }

  # Composite index to list files in a folder for a user in O(1)
  global_secondary_index {
    name            = "OwnerFolderIndex"
    hash_key        = "owner_id"
    range_key       = "folder_id"
    projection_type = "ALL"
  }

  # Index to check for duplicate file hashes instantly
  global_secondary_index {
    name            = "HashIndex"
    hash_key        = "file_hash"
    projection_type = "KEYS_ONLY"
  }

  tags = {
    Name        = "easydrive-files-table"
    Environment = "Dev"
  }
}

# 2. Table for Ephemeral Share Links with TTL
resource "aws_dynamodb_table" "easydrive-shares" {
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

  global_secondary_index {
    name            = "FileIdIndex"
    hash_key        = "file_id"
    projection_type = "ALL"
  }

  # Automatic deletion of expired share links via DynamoDB TTL
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = {
    Name        = "easydrive-shares-table"
    Environment = "Dev"
  }
}

# 3. Table for User Quota and Storage Breakdown
resource "aws_dynamodb_table" "easydrive-users" {
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

  # Global Secondary Index for instant O(1) user lookup by email
  global_secondary_index {
    name            = "EmailIndex"
    hash_key        = "email"
    projection_type = "ALL"
  }

  tags = {
    Name        = "easydrive-users-table"
    Environment = "Dev"
  }
}