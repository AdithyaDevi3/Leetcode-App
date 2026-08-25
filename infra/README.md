# Infrastructure as Code

This directory contains Terraform configurations for provisioning and managing the Leetcode App infrastructure on AWS.

## Directory Structure

```
infra/
├── modules/               # Reusable Terraform modules
│   ├── networking/       # VPC, subnets, security groups
│   ├── compute/          # ECS Fargate clusters and services
│   ├── database/         # RDS PostgreSQL instances
│   ├── storage/          # S3 buckets and policies
│   ├── queue/            # SQS queues and dead-letter queues
│   ├── cache/            # ElastiCache Redis clusters
│   ├── observability/    # CloudWatch dashboards and alarms
│   └── iam/              # IAM roles and policies
├── environments/          # Environment-specific configurations
│   ├── dev/              # Development environment
│   ├── staging/          # Staging environment
│   └── production/       # Production environment
└── README.md             # This file
```

## Prerequisites

### Required Tools

- [Terraform](https://www.terraform.io/downloads.html) >= 1.9.0
- [AWS CLI](https://aws.amazon.com/cli/) >= 2.0
- Valid AWS credentials with appropriate permissions

### AWS Permissions

The IAM user/role needs permissions to create:
- VPC and networking resources
- ECS Fargate clusters and services
- RDS instances
- S3 buckets
- SQS queues
- IAM roles and policies
- CloudWatch resources

## Initial Setup

### 1. Configure AWS Credentials

```bash
# Option 1: AWS CLI profiles
aws configure --profile leetcode-app-dev

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-west-2"
```

### 2. Initialize Terraform Backend

For each environment:

```bash
cd environments/dev
terraform init
```

### 3. Create tfvars File

Copy the example and fill in your values:

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your specific values
```

## Usage

### Plan Changes

```bash
cd environments/dev
terraform plan
```

### Apply Changes

```bash
terraform apply
```

### Destroy Resources

```bash
terraform destroy
```

## Environments

### Development

- **Purpose:** Development and testing
- **Location:** `environments/dev/`
- **Domain:** `dev.leetcode-app.example.com`
- **Database:** Single-AZ RDS with automated backups
- **Compute:** Minimal ECS tasks (1 vCPU, 2GB RAM)
- **Cost Optimization:** Spot instances, smaller instance types

### Staging

- **Purpose:** Pre-production testing and QA
- **Location:** `environments/staging/`
- **Domain:** `staging.leetcode-app.example.com`
- **Database:** Multi-AZ RDS with daily backups
- **Compute:** Production-like ECS tasks
- **Features:** Blue-green deployment testing

### Production

- **Purpose:** Live user-facing environment
- **Location:** `environments/production/`
- **Domain:** `leetcode-app.example.com`
- **Database:** Multi-AZ RDS with PITR (7 days)
- **Compute:** Auto-scaling ECS tasks
- **Features:** High availability, disaster recovery

## State Management

Terraform state is stored in S3 with DynamoDB locking:

- **State Bucket:** `leetcode-app-terraform-state-<env>`
- **Lock Table:** `leetcode-app-terraform-locks-<env>`
- **Encryption:** AES-256 (S3-managed keys)
- **Versioning:** Enabled

## Modules

### Networking

Creates VPC, subnets, NAT gateways, and security groups.

**Inputs:**
- `vpc_cidr` - VPC CIDR block (e.g., `10.0.0.0/16`)
- `availability_zones` - List of AZs (e.g., `["us-west-2a", "us-west-2b"]`)

**Outputs:**
- `vpc_id` - VPC ID
- `public_subnet_ids` - Public subnet IDs
- `private_subnet_ids` - Private subnet IDs

### Compute

Creates ECS Fargate clusters, task definitions, and services.

**Inputs:**
- `cluster_name` - ECS cluster name
- `service_name` - ECS service name
- `task_cpu` - Task CPU units (e.g., `256`)
- `task_memory` - Task memory in MB (e.g., `512`)

**Outputs:**
- `cluster_arn` - ECS cluster ARN
- `service_name` - ECS service name

### Database

Creates RDS PostgreSQL instances with automated backups.

**Inputs:**
- `instance_class` - Instance type (e.g., `db.t4g.micro`)
- `allocated_storage` - Storage in GB (e.g., `20`)
- `multi_az` - Enable Multi-AZ (boolean)

**Outputs:**
- `endpoint` - Database endpoint
- `port` - Database port (default: 5432)

## CI/CD Integration

### GitHub Actions OIDC

The infrastructure uses GitHub Actions OIDC for authentication (no long-lived credentials).

**Setup:**
1. Create OIDC provider in AWS
2. Create IAM role with trust policy for GitHub
3. Add role ARN to GitHub secrets

**Usage in workflows:**

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: us-west-2
```

### Deployment Workflow

1. **Plan:** Terraform plan runs on PR creation
2. **Review:** Team reviews plan output
3. **Apply:** Terraform apply runs on merge to main
4. **Rollback:** Revert commit and re-apply

## Best Practices

### Security

- Use IAM roles for service access (no hardcoded credentials)
- Enable encryption at rest for all data stores
- Use security groups to restrict network access
- Enable CloudTrail for audit logging
- Store secrets in AWS Secrets Manager

### Cost Optimization

- Use Spot instances for non-critical workloads
- Enable RDS storage autoscaling
- Set up CloudWatch alarms for cost anomalies
- Tag all resources for cost allocation
- Schedule non-production resources to shut down overnight

### Reliability

- Use Multi-AZ deployments for databases
- Configure auto-scaling for ECS services
- Set up health checks and alarms
- Enable automated backups with 30-day retention
- Test disaster recovery procedures quarterly

### Compliance

- Enable S3 versioning for audit trails
- Configure log retention per data retention policy
- Use KMS for encryption key management
- Document all IAM policies and roles
- Review security posture monthly

## Troubleshooting

### Common Issues

**Issue:** `Error: error configuring Terraform AWS Provider`
**Solution:** Verify AWS credentials and region are configured correctly.

**Issue:** `Error: error creating RDS instance: DBSubnetGroupNotFoundFault`
**Solution:** Ensure VPC and subnets are created first. Check module dependencies.

**Issue:** `Error: error acquiring state lock`
**Solution:** Check DynamoDB lock table. If stale, manually remove lock entry.

**Issue:** `Error: InvalidParameterException: Task CPU and Memory invalid`
**Solution:** Verify ECS task CPU/memory combinations are valid per AWS docs.

## Maintenance

### Regular Tasks

- **Weekly:** Review Dependabot PRs for provider updates
- **Monthly:** Review AWS Trusted Advisor recommendations
- **Quarterly:** Update base AMIs and container images
- **Annually:** Rotate IAM access keys and review policies

### Disaster Recovery

1. **Backup Verification:** Test RDS snapshots monthly
2. **Multi-Region:** Plan multi-region deployment (Phase 8)
3. **Runbooks:** Document recovery procedures
4. **Drills:** Run disaster recovery drills quarterly

## Resources

- [Terraform AWS Provider Docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [AWS RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

## Support

For infrastructure questions:
- Open a GitHub issue with the `infrastructure` label
- Tag `@leetcode-app/devops` for urgent issues
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines
