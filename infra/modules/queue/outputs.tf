output "evaluation_queue_url" {
  value       = aws_sqs_queue.evaluation.url
  description = "Evaluation queue URL"
}
output "evaluation_queue_arn" {
  value       = aws_sqs_queue.evaluation.arn
  description = "Evaluation queue ARN"
}
output "execution_queue_url" {
  value       = aws_sqs_queue.execution.url
  description = "Execution queue URL"
}
output "execution_queue_arn" {
  value       = aws_sqs_queue.execution.arn
  description = "Execution queue ARN"
}
