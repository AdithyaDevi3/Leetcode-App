# ADR-007: Hosting and Infrastructure as Code

## Status

Accepted

## Context

The application requires reliable, scalable hosting with reproducible infrastructure across development, staging, and production environments. Manual infrastructure configuration leads to drift, incidents, and deployment delays.

## Decision

### Cloud Provider

**AWS as primary provider** (can port to GCP/Azure with minor changes)

Rationale:
- Mature service ecosystem
- Strong Kubernetes support (EKS) for sandbox isolation
- Cost-effective for our scale
- Team familiarity
- Extensive compliance certifications

### Infrastructure as Code Tool

**Terraform with modular structure**

Rationale:
- Cloud-agnostic (easier multi-cloud if needed)
- Strong state management and planning
- Mature ecosystem and modules
- Better for multi-environment composition than CloudFormation
- Version-controlled, reviewable changes

Alternative Considered: **Pulumi** (rejected for now due to learning curve, revisit in Phase 4)

### Infrastructure Architecture

```
┌─────────────────────────────────────┐
│         Production (AWS)             │
│                                      │
│  ┌────────────────────────────┐     │
│  │  CloudFront CDN + WAF      │     │
│  └───────────┬────────────────┘     │
│              │                       │
│  ┌───────────▼────────────────┐     │
│  │  Application Load Balancer │     │
│  └───────────┬────────────────┘     │
│              │                       │
│  ┌───────────▼────────────────┐     │
│  │  ECS Fargate (Web + API)   │     │
│  │  • Auto-scaling            │     │
│  │  • Health checks           │     │
│  │  • Blue-green deployments  │     │
│  └───────────┬────────────────┘     │
│              │                       │
│  ┌───────────▼────────────────┐     │
│  │  RDS PostgreSQL 16         │     │
│  │  • Multi-AZ                │     │
│  │  • Automated backups       │     │
│  │  • Encryption at rest      │     │
│  └────────────────────────────┘     │
│                                      │
│  ┌────────────────────────────┐     │
│  │  EKS (Judge0 Sandbox)      │     │
│  │  • Network policies        │     │
│  │  • Pod security policies   │     │
│  │  • Node isolation          │     │
│  └────────────────────────────┘     │
│                                      │
│  ┌────────────────────────────┐     │
│  │  ElastiCache (Redis)       │     │
│  │  • Session store           │     │
│  │  • Rate limiting           │     │
│  │  • Caching                 │     │
│  └────────────────────────────┘     │
│                                      │
│  ┌────────────────────────────┐     │
│  │  S3                        │     │
│  │  • Static assets           │     │
│  │  • Export downloads        │     │
│  │  • Terraform state (locked)│     │
│  └────────────────────────────┘     │
└─────────────────────────────────────┘
```

### Repository Structure

```
infra/
  modules/
    networking/       # VPC, subnets, security groups
    database/         # RDS, backups, monitoring
    app-services/     # ECS, ALB, auto-scaling
    sandbox/          # EKS, node groups, policies
    storage/          # S3, CloudFront
    observability/    # CloudWatch, X-Ray, alarms
  environments/
    development/
      main.tf
      variables.tf
      outputs.tf
    staging/
      main.tf
      variables.tf
      outputs.tf
    production/
      main.tf
      variables.tf
      outputs.tf
  scripts/
    init.sh           # Bootstrap new environment
    plan.sh           # Terraform plan wrapper
    apply.sh          # Terraform apply with approvals
    destroy.sh        # Safe destroy with confirmations
```

### Environment Strategy

- **Development:** Single-AZ, smaller instances, relaxed policies (cost-optimized)
- **Staging:** Production-like, used for release candidate testing
- **Production:** Multi-AZ, auto-scaling, strict security policies

### Deployment Strategy

**GitHub Actions with OIDC (no long-lived credentials)**

Workflow:
1. PR triggers `terraform plan` on affected environments
2. Plan output posted as PR comment
3. Approval required for production changes
4. Merge triggers `terraform apply`
5. Blue-green deployment for application updates
6. Automated rollback on health check failures

### State Management

- **Backend:** S3 with DynamoDB state locking
- **Encryption:** Server-side encryption with KMS
- **Versioning:** Enabled for state recovery
- **Separation:** Separate state files per environment

### Secrets Management

- **AWS Secrets Manager** for application secrets
- **No secrets in Terraform state** (use secret ARN references only)
- **Rotation:** 90-day rotation for database passwords
- **Least Privilege:** Each service gets only required secrets

### Cost Controls

- **Budgets:** Alert at 80% of monthly budget
- **Tagging:** Environment, service, owner tags on all resources
- **Spot Instances:** For non-critical workers
- **Auto-scaling:** Scale down during off-peak hours

## Consequences

### Easier

- Reproducible infrastructure across environments
- Version-controlled infrastructure changes
- Automated deployments reduce human error
- Clear cost attribution via tagging
- Disaster recovery through IaC recreation

### More Difficult

- Terraform state management requires discipline
- Team must learn Terraform and AWS
- Initial setup more complex than manual
- Breaking changes require careful migration
- Module versioning adds coordination overhead

## Review Date

2027-08-17 (1 year) - Review AWS costs, evaluate multi-cloud strategy if vendor negotiation needed

## Owners

- DevOps Lead: IaC implementation and maintenance
- Security Lead: Security group, IAM, and secrets review
- Finance: Cost monitoring and budget management
