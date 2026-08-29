# VPC Outputs
# output "vpc_id" {
#   description = "ID of the VPC"
#   value       = module.networking.vpc_id
# }

# output "private_subnet_ids" {
#   description = "IDs of private subnets"
#   value       = module.networking.private_subnet_ids
# }

# output "public_subnet_ids" {
#   description = "IDs of public subnets"
#   value       = module.networking.public_subnet_ids
# }

# Database Outputs
# output "db_endpoint" {
#   description = "RDS instance endpoint"
#   value       = module.database.endpoint
#   sensitive   = true
# }

# output "db_port" {
#   description = "RDS instance port"
#   value       = module.database.port
# }

# Compute Outputs
# output "ecs_cluster_name" {
#   description = "Name of the ECS cluster"
#   value       = module.compute.cluster_name
# }

# output "web_service_url" {
#   description = "URL of the web service"
#   value       = module.compute.web_service_url
# }

# Storage Outputs
# output "s3_bucket_name" {
#   description = "Name of the S3 bucket"
#   value       = module.storage.bucket_name
# }

output "evaluation_queue_url" {
  description = "URL of the evaluation queue"
  value       = module.queue.evaluation_queue_url
}

# Placeholder for Phase 0.4
output "environment" {
  description = "Environment name"
  value       = "dev"
}

output "region" {
  description = "AWS region"
  value       = var.aws_region
}
