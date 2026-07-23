# MooNsConfig production infrastructure

This root provisions the commercial SaaS baseline in `ap-south-1`: private ECS
API/worker services, an ALB, Multi-AZ MySQL, RDS Proxy, encrypted Redis, private
S3 buckets, cross-region immutable backup copies, CloudFront SaaS Manager, WAF,
GuardDuty malware scanning, Security Hub, CloudTrail, alarms and budgets.

## Deployment gates

1. Create an encrypted remote-state S3 bucket and DynamoDB lock table outside
   this stack, then supply their values with `terraform init -backend-config`.
2. Create the JSON application secret identified by `app_secret_arn`. It must
   contain `DATABASE_URL`, `PLATFORM_DATABASE_URL`, `JWT_ACCESS_SECRET`,
   `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `ENCRYPTION_KEY`, `REDIS_PASSWORD`, and
   `ORIGIN_SHARED_SECRET`. The last value must equal the sensitive Terraform
   `origin_shared_secret` input.
3. Supply reviewed ACM certificates: the ALB certificate is in Mumbai, while the
   CloudFront certificate is in `us-east-1`.
4. Supply immutable API/worker image digests, not mutable tags.
5. Apply first with public registration disabled. Run migrations, synthetic
   tenant provisioning, restore drills, security tests, and the five-company
   beta before enabling registration.

The application `/api/v1/readiness` endpoint remains the launch authority and
reports external credentials, legal approvals, tax configuration, restore
evidence and penetration-test evidence that Terraform cannot create.

## Commands

```powershell
terraform -chdir=infra/terraform init -backend-config=backend.hcl
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform plan -out=production.tfplan
terraform -chdir=infra/terraform apply production.tfplan
```

Never commit `backend.hcl`, `*.tfvars`, plans, state, or application secrets.
