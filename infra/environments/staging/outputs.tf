# Placeholder for Phase 0.4
output "environment" {
  description = "Environment name"
  value       = "staging"
}

output "region" {
  description = "AWS region"
  value       = var.aws_region
}

output "evaluation_queue_url" {
  description = "URL of the evaluation queue"
  value       = module.queue.evaluation_queue_url
}
