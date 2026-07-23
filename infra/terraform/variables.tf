variable "project" {
  type    = string
  default = "moonsconfig"
}
variable "environment" {
  type    = string
  default = "production"
}
variable "aws_region" {
  type    = string
  default = "ap-south-1"
}
variable "backup_region" {
  type    = string
  default = "ap-south-2"
}
variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}
variable "availability_zones" {
  type    = list(string)
  default = ["ap-south-1a", "ap-south-1b"]
}
variable "api_image" { type = string }
variable "worker_image" { type = string }
variable "app_secret_arn" {
  type      = string
  sensitive = true
}
variable "origin_shared_secret" {
  type      = string
  sensitive = true
}
variable "malware_webhook_secret" {
  type      = string
  sensitive = true
}
variable "alb_certificate_arn" { type = string }
variable "cloudfront_certificate_arn" { type = string }
variable "app_base_domain" { type = string }
variable "route53_zone_id" { type = string }
variable "api_desired_count" {
  type    = number
  default = 2
}
variable "worker_desired_count" {
  type    = number
  default = 2
}
variable "db_instance_class" {
  type    = string
  default = "db.r7g.large"
}
variable "db_engine_version" {
  type    = string
  default = "8.4"
}
variable "alert_email" { type = string }
variable "container_port" {
  type    = number
  default = 4000
}
variable "api_cpu" {
  type    = number
  default = 1024
}
variable "api_memory" {
  type    = number
  default = 2048
}
variable "worker_cpu" {
  type    = number
  default = 1024
}
variable "worker_memory" {
  type    = number
  default = 2048
}
variable "monthly_budget_inr" {
  type    = number
  default = 250000
}

locals {
  name = "${var.project}-${var.environment}"
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
