# Development Environment

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "leetcode-app-terraform-state-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "leetcode-app-terraform-locks-dev"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "development"
      Project     = "leetcode-app"
      ManagedBy   = "terraform"
      CostCenter  = "engineering"
    }
  }
}

# Local variables
locals {
  environment = "dev"
  app_name    = "leetcode-app"
  common_tags = {
    Environment = local.environment
    Application = local.app_name
  }
}

# NOTE: Modules will be implemented in future commits
# This is a placeholder structure for Phase 0.4

# Networking module (future)
# module "networking" {
#   source = "../../modules/networking"
#   
#   vpc_cidr           = var.vpc_cidr
#   availability_zones = var.availability_zones
#   environment        = local.environment
#   tags               = local.common_tags
# }

# Database module (future)
# module "database" {
#   source = "../../modules/database"
#   
#   instance_class     = var.db_instance_class
#   allocated_storage  = var.db_allocated_storage
#   multi_az           = false  # Single-AZ for dev
#   vpc_id             = module.networking.vpc_id
#   private_subnet_ids = module.networking.private_subnet_ids
#   environment        = local.environment
#   tags               = local.common_tags
# }

# Compute module (future)
# module "compute" {
#   source = "../../modules/compute"
#   
#   cluster_name       = "${local.app_name}-${local.environment}"
#   vpc_id             = module.networking.vpc_id
#   private_subnet_ids = module.networking.private_subnet_ids
#   public_subnet_ids  = module.networking.public_subnet_ids
#   environment        = local.environment
#   tags               = local.common_tags
# }

# Storage module (future)
# module "storage" {
#   source = "../../modules/storage"
#   
#   bucket_name = "${local.app_name}-${local.environment}"
#   environment = local.environment
#   tags        = local.common_tags
# }

# Queue module (future)
# module "queue" {
#   source = "../../modules/queue"
#   
#   queue_prefix = "${local.app_name}-${local.environment}"
#   environment  = local.environment
#   tags         = local.common_tags
# }

# Observability module (future)
# module "observability" {
#   source = "../../modules/observability"
#   
#   environment = local.environment
#   tags        = local.common_tags
# }
