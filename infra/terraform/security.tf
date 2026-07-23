resource "aws_guardduty_detector" "main" {
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"
}

resource "aws_securityhub_account" "main" {}

resource "aws_securityhub_standards_subscription" "foundational" {
  depends_on    = [aws_securityhub_account.main]
  standards_arn = "arn:aws:securityhub:${var.aws_region}::standards/aws-foundational-security-best-practices/v/1.0.0"
}

resource "aws_iam_role" "malware_protection" {
  name = "${local.name}-guardduty-malware"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "malware-protection-plan.guardduty.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "malware_protection" {
  role = aws_iam_role.malware_protection.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObjectTagging", "s3:GetObjectTagging", "s3:ListBucket"], Resource = [aws_s3_bucket.app["uploads"].arn, "${aws_s3_bucket.app["uploads"].arn}/*"] },
      { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = aws_kms_key.data.arn },
      { Effect = "Allow", Action = ["events:PutRule", "events:DeleteRule", "events:PutTargets", "events:RemoveTargets"], Resource = "arn:aws:events:${var.aws_region}:*:rule/DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*" },
      { Effect = "Allow", Action = ["events:DescribeRule", "events:ListTargetsByRule"], Resource = "*" }
    ]
  })
}

resource "aws_guardduty_malware_protection_plan" "uploads" {
  role = aws_iam_role.malware_protection.arn
  protected_resource {
    s3_bucket {
      bucket_name     = aws_s3_bucket.app["uploads"].id
      object_prefixes = ["tenants/"]
    }
  }
  actions {
    tagging {
      status = "ENABLED"
    }
  }
}

resource "aws_cloudwatch_event_connection" "malware_webhook" {
  name               = "${local.name}-malware-webhook"
  authorization_type = "API_KEY"
  auth_parameters {
    api_key {
      key   = "x-malware-webhook-secret"
      value = var.malware_webhook_secret
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "malware_webhook" {
  name                             = "${local.name}-malware-webhook"
  invocation_endpoint              = "https://api.${var.app_base_domain}/api/v1/platform/uploads/malware-results"
  http_method                      = "POST"
  invocation_rate_limit_per_second = 20
  connection_arn                   = aws_cloudwatch_event_connection.malware_webhook.arn
}

resource "aws_cloudwatch_event_rule" "malware_results" {
  name = "${local.name}-malware-results"
  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Malware Protection Object Scan Result"]
    detail      = { s3ObjectDetails = { bucketName = [aws_s3_bucket.app["uploads"].id] } }
  })
}

resource "aws_iam_role" "eventbridge_destination" {
  name = "${local.name}-eventbridge-destination"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "events.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "eventbridge_destination" {
  role = aws_iam_role.eventbridge_destination.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "events:InvokeApiDestination", Resource = aws_cloudwatch_event_api_destination.malware_webhook.arn }]
  })
}

resource "aws_cloudwatch_event_target" "malware_results" {
  rule     = aws_cloudwatch_event_rule.malware_results.name
  arn      = aws_cloudwatch_event_api_destination.malware_webhook.arn
  role_arn = aws_iam_role.eventbridge_destination.arn
}

resource "aws_cloudtrail" "main" {
  name                          = local.name
  s3_bucket_name                = aws_s3_bucket.app["logs"].id
  s3_key_prefix                 = "cloudtrail"
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.data.arn
  depends_on                    = [aws_s3_bucket_policy.cloudtrail]
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.app["logs"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "CloudTrailAcl", Effect = "Allow", Principal = { Service = "cloudtrail.amazonaws.com" }, Action = "s3:GetBucketAcl", Resource = aws_s3_bucket.app["logs"].arn },
      { Sid = "CloudTrailWrite", Effect = "Allow", Principal = { Service = "cloudtrail.amazonaws.com" }, Action = "s3:PutObject", Resource = "${aws_s3_bucket.app["logs"].arn}/cloudtrail/AWSLogs/${data.aws_caller_identity.current.account_id}/*", Condition = { StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" } } },
      { Sid = "AlbLogDelivery", Effect = "Allow", Principal = { Service = "logdelivery.elasticloadbalancing.amazonaws.com" }, Action = "s3:PutObject", Resource = "${aws_s3_bucket.app["logs"].arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*" }
    ]
  })
}
