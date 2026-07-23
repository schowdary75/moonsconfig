terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.53"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = local.tags
  }
}

provider "aws" {
  alias  = "global"
  region = "us-east-1"
  default_tags {
    tags = local.tags
  }
}

provider "aws" {
  alias  = "backup"
  region = var.backup_region
  default_tags {
    tags = local.tags
  }
}
