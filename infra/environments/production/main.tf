# Production Environment

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "leetcode-app-terraform-state-production"
    key            = "production/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "leetcode-app-terraform-locks-production"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "production"
      Project     = "leetcode-app"
      ManagedBy   = "terraform"
      CostCenter  = "production"
      Critical    = "true"
    }
  }
}

locals {
  environment = "production"
  app_name    = "leetcode-app"
  common_tags = {
    Environment = local.environment
    Application = local.app_name
  }
}

# NOTE: Modules will be implemented in future commits
# This is a placeholder structure for Phase 0.4
