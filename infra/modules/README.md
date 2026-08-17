# Terraform Modules

This directory contains reusable Terraform modules for the Leetcode App infrastructure.

## Available Modules

### Coming in Phase 1+

The following modules will be implemented as we build out the platform:

- **networking** - VPC, subnets, NAT gateways, security groups
- **compute** - ECS Fargate clusters, task definitions, services
- **database** - RDS PostgreSQL instances with automated backups
- **storage** - S3 buckets for user uploads and static assets
- **queue** - SQS queues for async evaluation processing
- **cache** - ElastiCache Redis for session storage
- **observability** - CloudWatch dashboards, alarms, log groups
- **iam** - IAM roles and policies for least-privilege access

## Module Structure

Each module follows this standard structure:

```
module-name/
├── main.tf           # Primary resource definitions
├── variables.tf      # Input variables
├── outputs.tf        # Output values
├── data.tf           # Data sources
├── locals.tf         # Local values
├── README.md         # Module documentation
└── examples/         # Usage examples
    └── basic/
        ├── main.tf
        └── variables.tf
```

## Module Guidelines

### Naming Conventions

- Use lowercase with underscores for resource names
- Prefix resources with module name (e.g., `networking_vpc`)
- Use descriptive names that indicate purpose

### Variables

- All variables must have descriptions
- Provide sensible defaults where possible
- Mark sensitive variables with `sensitive = true`
- Group related variables together

### Outputs

- Export all resource IDs and ARNs
- Export connection endpoints and URLs
- Mark sensitive outputs with `sensitive = true`

### Documentation

- README must include:
  - Module purpose and features
  - Input variable reference table
  - Output value reference table
  - Usage examples
  - Prerequisites and dependencies

### Testing

- Each module should have an `examples/` directory
- Examples should be deployable with `terraform apply`
- Test modules in isolation before integration

## Example Module Usage

```hcl
module "networking" {
  source = "../../modules/networking"

  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-west-2a", "us-west-2b"]
  environment        = "dev"
  
  tags = {
    Project = "leetcode-app"
  }
}

module "database" {
  source = "../../modules/database"

  instance_class     = "db.t4g.micro"
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  environment        = "dev"
  
  tags = {
    Project = "leetcode-app"
  }
}
```

## Best Practices

### Composition Over Inheritance

- Prefer small, focused modules
- Combine modules in environment configs
- Avoid deeply nested module calls

### Versioning

- Use semantic versioning for module releases
- Pin module versions in production
- Test version upgrades in dev/staging first

### State Management

- Each environment has separate state
- Use remote state with locking
- Never commit `.tfstate` files

### Security

- No hardcoded credentials
- Use AWS Secrets Manager for sensitive data
- Implement least-privilege IAM policies
- Enable encryption for all data stores

## Development Workflow

1. **Design:** Plan module interface (variables, outputs)
2. **Implement:** Write Terraform resources
3. **Document:** Update README with examples
4. **Test:** Deploy in dev environment
5. **Review:** Submit PR with plan output
6. **Release:** Tag with semantic version

## Questions?

For module questions:
- Open a GitHub issue with `infrastructure` label
- Tag `@leetcode-app/devops`
- See [../README.md](../README.md) for general infrastructure docs
