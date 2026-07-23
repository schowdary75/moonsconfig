# Migration and rollback runbook

The immutable rollback source is tag `pre-enterprise-migration` and the corresponding published application image. The source MariaDB database remains untouched until cutover acceptance.

## Rehearsal

1. Take a consistent sanitized source dump and restore it to an isolated MySQL 8.4 instance.
2. Compare all 124 tables, columns, indexes, 22 source foreign keys, collations, enum values, auto-increment positions, and row counts.
3. Validate primary-key ranges, critical-table checksums, orphan checks, duplicate checks, and sampled business records.
4. Mark `202607150000_legacy_core_baseline` as applied for an existing restored schema. Apply `202607150001_enterprise_foundation` normally.
5. Run `prisma migrate diff`; the expected result is `No difference detected`.
6. Copy uploads and compare file counts and checksums.
7. Run all quality gates plus public, authenticated, integration-mock, upload, route-map, and export smoke tests.

## Maintenance-window cutover

1. Enable maintenance mode and freeze writes.
2. Stop the old API, timers, and workers.
3. Take and verify the final consistent dump.
4. Restore to MySQL 8.4 and execute the rehearsal validation.
5. Deploy the Prisma baseline/additive migrations.
6. Copy and checksum uploads.
7. Start MySQL, Redis, API, worker, client, and Nginx.
8. Run health, login, RBAC, public contract, upload, map/export, queue, and provider-adapter smoke tests.
9. Open traffic only after every gate passes.

Before traffic opens, any failed validation triggers shutdown of the new stack and redeployment of the rollback image against the untouched source database. Once new writes are accepted, incidents use audited roll-forward remediation rather than silently switching databases.
