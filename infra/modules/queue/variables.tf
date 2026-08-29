variable "queue_prefix" {
  type        = string
  description = "Unique queue name prefix"
}
variable "tags" {
  type        = map(string)
  description = "Tags applied to queues"
  default     = {}
}
variable "evaluation_visibility_timeout_seconds" {
  type        = number
  description = "Evaluation job visibility timeout"
  default     = 300
}
variable "execution_visibility_timeout_seconds" {
  type        = number
  description = "Execution job visibility timeout"
  default     = 120
}
variable "message_retention_seconds" {
  type        = number
  description = "Primary queue retention"
  default     = 345600
}
variable "dead_letter_retention_seconds" {
  type        = number
  description = "Dead-letter queue retention"
  default     = 1209600
}
variable "max_receive_count" {
  type        = number
  description = "Attempts before dead-lettering"
  default     = 3
}
