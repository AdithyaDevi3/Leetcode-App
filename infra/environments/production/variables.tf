# AWS Region
variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-west-2"
}

# Networking
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.2.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-west-2a", "us-west-2b", "us-west-2c"]
}

# Database
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS in GB"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "leetcodeapp_production"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "leetcodeapp_admin"
  sensitive   = true
}

# Compute
variable "web_task_cpu" {
  description = "CPU units for web tasks"
  type        = number
  default     = 1024
}

variable "web_task_memory" {
  description = "Memory in MB for web tasks"
  type        = number
  default     = 2048
}

variable "web_task_count_min" {
  description = "Minimum count of web tasks"
  type        = number
  default     = 2
}

variable "web_task_count_max" {
  description = "Maximum count of web tasks"
  type        = number
  default     = 10
}

# Tags
variable "additional_tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
