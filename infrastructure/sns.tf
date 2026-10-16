# SNS Topic for File Download & Security Alerts
resource "aws_sns_topic" "easydrive-download-alerts" {
  name = "easydrive-download-alerts"

  tags = {
    Name        = "easydrive-download-alerts"
    Environment = "Dev"
  }
}

# Optional Email Subscription (active only if alert_email variable is provided)
resource "aws_sns_topic_subscription" "email_alert" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.easydrive-download-alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

