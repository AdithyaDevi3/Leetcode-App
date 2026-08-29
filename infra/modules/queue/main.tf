resource "aws_sqs_queue" "evaluation_dead_letter" {
  name                      = "${var.queue_prefix}-evaluation-dlq"
  message_retention_seconds = var.dead_letter_retention_seconds
  tags                      = var.tags
}

resource "aws_sqs_queue" "evaluation" {
  name                       = "${var.queue_prefix}-evaluation"
  visibility_timeout_seconds = var.evaluation_visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds
  receive_wait_time_seconds  = 20
  redrive_policy = jsonencode({ deadLetterTargetArn = aws_sqs_queue.evaluation_dead_letter.arn, maxReceiveCount = var.max_receive_count })
  tags = var.tags
}

resource "aws_sqs_queue" "execution_dead_letter" {
  name                      = "${var.queue_prefix}-execution-dlq"
  message_retention_seconds = var.dead_letter_retention_seconds
  tags                      = var.tags
}

resource "aws_sqs_queue" "execution" {
  name                       = "${var.queue_prefix}-execution"
  visibility_timeout_seconds = var.execution_visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds
  receive_wait_time_seconds  = 20
  redrive_policy = jsonencode({ deadLetterTargetArn = aws_sqs_queue.execution_dead_letter.arn, maxReceiveCount = var.max_receive_count })
  tags = var.tags
}
