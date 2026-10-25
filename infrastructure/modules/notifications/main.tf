variable "alert_email" {
  type    = string
  default = ""
}

resource "aws_sns_topic" "alerts" {
  name = "easydrive-download-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

output "topic_arn" {
  value = aws_sns_topic.alerts.arn
}
