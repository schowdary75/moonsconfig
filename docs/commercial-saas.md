# Commercial multi-tenant SaaS

This is the operational contract for the MooNsConfig commercial foundation.
It separates what the repository implements from evidence and credentials that
must exist before public production launch.

## Isolation and lifecycle

- `moonsconfig_platform` stores global identities, memberships, tenants,
  domains, trials, subscriptions, payments, invoices, MFA, SSO, consent,
  exports, deletion, migrations, operators, security events, backups, and
  tamper-evident platform audit events.
- Each company receives a stable database and least-privilege user named from
  its normalized company name plus immutable tenant ID. Renames never rename a
  database. Production credentials live in AWS Secrets Manager under KMS.
- Signed membership claims create an `AsyncLocalStorage` `TenantContext`.
  Prisma, raw compatibility operations, queues, cron, Redis, sockets, files,
  exports, providers, AI, email, SMS, and voice resolve through this context.
- Legacy single-company routing defaults to disabled. Readiness fails closed if
  it or legacy local-storage sessions are enabled.
- Tenant clients use direct TLS, `connection_limit=2`, bounded caching, idle
  eviction, connection budgeting, and disconnect-on-eviction. Platform and
  provisioning traffic may use RDS Proxy.
- Voluntary deletion locks immediately and has a seven-day cancellation period.
  Cancellation/unpaid retention is 90 days. Purge is resumable and removes the
  database/user, secrets, CloudFront tenants, S3 objects, Redis keys, domains,
  exports, recordings, jobs, and providers; encrypted backups age out within
  another 30 days.

## Identity and commercial access

The catalog in `server/src/constants/commercialPlans.ts` is the entitlement
source. Effective access is:

1. active tenant/trial/subscription status;
2. verified membership and role permission;
3. plan feature entitlement; and
4. current quota/capacity.

Owners and administrators must enroll TOTP MFA. Sensitive actions require MFA
within ten minutes. TOTP secrets are encrypted; recovery codes are hashed,
single-use, and replay-protected. Access tokens last ten minutes. Rotating
HttpOnly refresh-token families last 30 days and the family is revoked on reuse.

Enterprise SSO uses WorkOS SAML/OIDC with PKCE, state, nonce, verified domains,
stored connection IDs, and invite-only membership matching. It never creates an
uninvited viewer. Owner break-glass uses MFA and is fully audited.

Successfully provisioned companies receive seven exact days of Enterprise
software access without a card, with 10 invited staff, 5 GB storage, one full
export, `noindex`, and customer-owned credentials for external communication.
Starter and Business use the agreed INR prices and annual discount; Enterprise
is sales-assisted.

## Provisioning, billing, and customer controls

- Verified registration reserves one trial per owner/company/domain and runs an
  idempotent provisioning state machine. The trial begins only after migration,
  seeding, storage namespace, owner creation, and subdomain creation succeed.
- Razorpay checkout is hosted. Browser callbacks never grant access. Raw-body
  HMAC webhooks, event IDs, payload hashes, monotonic provider timestamps, and
  scheduled reconciliation update the internal entitlement ledger.
- Upgrades are immediate. Downgrades occur at renewal only when current seats
  and storage fit the target plan. Downgrades never delete data.
- Zoho Books synchronization snapshots seller/customer GST details, place of
  supply, tax treatment, line items, totals, provider IDs, state, and PDF. Live
  issuance stays disabled until reviewed seller, GST, SAC/tax, sequence, and
  refund configuration is supplied.
- CloudFront SaaS Manager domains progress through DNS and certificate states.
  Origin-secret and distribution-tenant identity checks prevent arbitrary Host
  headers from selecting a tenant.
- Uploads enter tenant quarantine under immutable UUID keys. GuardDuty scan
  results are idempotent; only `NO_THREATS_FOUND` objects reach the clean prefix.
- Owner exports require recent MFA, exclude credentials/tokens/hashes, stream an
  encrypted tenant ZIP to object storage with SHA-256 metadata, expose a 24-hour
  signed URL, and expire after seven days.

## Operations and infrastructure

Separate platform operators use password plus replay-protected TOTP and a
ten-minute operator token. Support access is role-, reason-, ticket-, time-,
owner-approval-, and audit-bound. The console exposes fleet health,
provisioning, billing reconciliation, domains, exports, deletion, migrations,
security events, backups, and restore drills.

`infra/terraform` validates against AWS provider 6.55 and provisions Mumbai
Fargate API/workers, ALB, Multi-AZ RDS MySQL with 35-day PITR and deletion
protection, RDS Proxy, encrypted Multi-AZ Redis, private S3, CloudFront SaaS
Manager, WAF, GuardDuty malware scanning, Security Hub, CloudTrail, KMS,
cross-region immutable backup copies, alarms, budgets, and autoscaling.

Fleet migrations use leases, schema gates, resumable failures, and
internal → 5% → 25% → 100% stages. Nightly logical tenant backups complement
RDS PITR; the operations console runs isolated scratch-database restore drills.

## Quality gates

CI runs Prettier, lint, typecheck, route-security and runtime-SQL guards, both
Prisma validations, MySQL migrations, 56 Vitest tests, client/server builds, and
Terraform format/validation. Release acceptance additionally requires disposable
AWS/provider integration tests, the 100-tenant/500-session load run, staged beta,
and independent tenant-escape penetration testing.

The raw-SQL guard has an explicit temporary allowlist for legacy operation
adapters. Those adapters resolve only through the authenticated tenant Prisma
proxy and production legacy routing is disabled. The remaining `@ts-nocheck`
operation adapters are migration debt and must be replaced domain by domain;
they are not represented as fully type-hardened.

## External launch gates

`GET /api/v1/readiness` is the launch authority. Public registration must remain
off until it reports all gates ready, including:

- real AWS/account/domain access and applied infrastructure;
- Razorpay live plans, secrets, webhook delivery, and reconciliation proof;
- WorkOS production organization/domain/connection credentials;
- Zoho Books organization, OAuth, reviewed GST seller and tax configuration;
- sender/provider credentials and India DLT/recording/consent controls;
- reviewed Terms, Privacy, AUP, DPA, cancellation/refund policy, SLA,
  subprocessors, Enterprise MSA/order form, and legal/tax approval date;
- public status page, incident contact, on-call/runbook ownership;
- a successful tenant restore in the last 30 days;
- passing load evidence and an independent penetration test with no unresolved
  critical/high issue in the last 180 days; and
- a controlled internal tenant and five-company beta.

The archived legacy database is never selected by commercial SaaS routing and
is not migrated by this delivery.
