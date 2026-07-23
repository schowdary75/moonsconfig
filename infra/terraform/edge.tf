data "aws_cloudfront_cache_policy" "disabled" {
  provider = aws.global
  name     = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_except_host" {
  provider = aws.global
  name     = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_function" "tenant_identity" {
  provider = aws.global
  name     = "${local.name}-tenant-identity"
  runtime  = "cloudfront-js-2.0"
  publish  = true
  code     = <<-JAVASCRIPT
    import cf from 'cloudfront';

    async function handler(event) {
      const request = event.request;
      request.headers['x-moons-original-host'] = { value: request.headers.host.value };
      const tenant = cf.distributionTenant;
      if (tenant && tenant.id) {
        request.headers['x-moons-distribution-tenant'] = { value: tenant.id };
      }
      return request;
    }
  JAVASCRIPT
}

resource "aws_wafv2_web_acl" "cloudfront" {
  provider = aws.global
  name     = "${local.name}-edge"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-common"
    priority = 10
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-known-bad-inputs"
    priority = 20
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "rate-limit"
    priority = 30
    action {
      block {}
    }
    statement {
      rate_based_statement {
        aggregate_key_type = "IP"
        limit              = 2000
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-edge"
    sampled_requests_enabled   = true
  }
}

resource "aws_cloudfront_multitenant_distribution" "app" {
  provider   = aws.global
  comment    = "MooNsConfig tenant application distribution"
  enabled    = true
  web_acl_id = aws_wafv2_web_acl.cloudfront.arn

  origin {
    domain_name = aws_lb.api.dns_name
    id          = "api-alb"
    custom_header {
      header_name  = "x-moons-origin-secret"
      header_value = var.origin_shared_secret
    }
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_except_host.id
    compress                 = true
    allowed_methods {
      items          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods = ["GET", "HEAD"]
    }
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.tenant_identity.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.cloudfront_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tenant_config {
    parameter_definition {
      name = "workspace"
      definition {
        string_schema {
          required      = false
          default_value = "default"
          comment       = "Auditable workspace marker"
        }
      }
    }
  }
}

resource "aws_cloudfront_connection_group" "app" {
  provider     = aws.global
  name         = local.name
  enabled      = true
  ipv6_enabled = true
}

resource "aws_route53_record" "api" {
  zone_id = var.route53_zone_id
  name    = "api.${var.app_base_domain}"
  type    = "A"
  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "tenant_wildcard" {
  zone_id = var.route53_zone_id
  name    = "*.${var.app_base_domain}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_cloudfront_connection_group.app.routing_endpoint]
}
