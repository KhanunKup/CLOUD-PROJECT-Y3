module "storage" {
  source      = "./modules/storage2"
  bucket_name = "${var.bucket_prefix}-storage"
}

module "database" {
  source = "./modules/database"
}

#module "notifications" {
#  source      = "./modules/notifications"
#  alert_email = var.alert_email
#}

module "compute" {
  source     = "./modules/compute"
  source_dir = "${path.root}/../backend/src/api"
  build_dir  = "${path.root}/.build"

  environment = {
    NODE_ENV       = "production"
    SESSION_SECRET = var.session_secret
    FILES_TABLE    = module.database.files_table
    SHARES_TABLE   = module.database.shares_table
    USERS_TABLE    = module.database.users_table
    STORAGE_BUCKET = module.storage.bucket_name
#    SNS_TOPIC_ARN  = module.notifications.topic_arn
  }
}

module "api" {
  source               = "./modules/api"
  lambda_invoke_arn    = module.compute.invoke_arn
  lambda_function_name = module.compute.function_name
  throttle_burst       = var.api_throttle_burst
  throttle_rate        = var.api_throttle_rate
}

module "alerts" {
  source               = "./modules/alerts"
  lambda_function_name = module.compute.function_name
  api_id               = module.api.api_id
  invocation_threshold = var.invocation_alarm_threshold
  region               = var.region
}
