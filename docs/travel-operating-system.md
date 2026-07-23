# Travel operating system and governed Maya

This release adds the canonical, tenant-database-scoped layer used for new travel workflows while preserving legacy API adapters during migration.

## Canonical lifecycle

`Traveller` owns verified identities, preferences and consent. A `TravelTrip` owns party members, dated `TripService` rows, supplier reservations, payment schedules, secure document metadata, refund cases and conversations. Legacy bookings are linked by immutable IDs through `bookings.canonical_trip_id`, `traveller_id`, `quote_version_id` and `package_id`; matching by `item_name` is not used by the backfill.

Rate-card pricing creates immutable `QuoteVersion` and `QuoteLineSnapshot` records. A quote can be released to the Traveller Hub only when every line is bindable and the quote confidence is `confirmed`. Views, comments and acceptance are server events. Acceptance records signer, terms version, authenticated traveller, timestamp, IP and user agent, then creates a trip and payment schedule idempotently.

The authenticated Traveller Hub is available at `/traveller-hub`. It exposes trips, readiness, services, participants, payment schedules, proposals and wallet metadata. Travel documents are uploaded directly to tenant-isolated object-storage quarantine; the canonical record remains `pending` until the malware webhook promotes the object and sets it `clean`. Object keys, file contents, passport values and scans are not passed to Maya or application logs.

## Maya authority

Voice, support chat, WhatsApp and SMS use the registry in `server/src/maya`. The scheduled support worker no longer calls the legacy web-search/AI-total quote agent. Sensitive identifier-like text is redacted before model context or canonical message storage.

Maya's authority is application policy, not a prompt:

- Read-only catalogue, profile and status tools execute automatically.
- Low-risk internal writes create an action proposal and execution audit row.
- External messaging and commercial actions wait for an explicit staff approval.
- Money, booking changes, insurance binding, EMI, refunds, escrow and legal/visa claims remain approval-bound.
- Proposals expire after 30 minutes. High-risk approvals require a recent-MFA signal.
- `MAYA_EXTERNAL_WRITES_ENABLED=false` is the default environment kill switch. Tenant master,
  per-channel and per-tool switches are managed in Maya Ops with recent MFA; tool allowlists can
  further reduce capability.

The Maya Ops Center shows pending approvals, provider capability status, outbox backlog and dead letters. An approved proposal emits `MayaActionApproved`; the transactional outbox runner claims it idempotently through the BullMQ maintenance queue.

## Event delivery

Domain writes add `DomainOutboxEvent` in the same MySQL transaction. The `travel-automation` BullMQ maintenance job runs every 30 seconds by default, claims pending/failed rows, creates one `AutomationRun`, retries with bounded exponential backoff and dead-letters after five failures. Duplicate events and provider callbacks are constrained by unique idempotency keys.

Provider-dependent playbooks stay durable and staff-visible when no certified handler exists. They do not call a simulator or fabricate availability.

## Deployment

1. Generate Prisma clients and deploy migrations, including `202607220003_travel_operating_system`.
2. Keep `MAYA_EXTERNAL_WRITES_ENABLED=false` for shadow/read-only rollout.
3. Configure secure S3 uploads and the malware webhook before enabling customer document upload.
4. Configure certified providers individually. Capability readiness reports missing providers as `unconfigured` and fails closed.
5. Run `adminBackfillCanonicalTravelDomain` in small batches. Identity conflicts return `TRAVELLER_MERGE_REQUIRED` and stay for staff review.
6. Validate staff copilot and approval audit data before enabling governed low-risk writes for beta tenants.

Required provider variables are documented in both environment examples. Travel-rule providers default to `disabled`; official passenger-rights and visa claims must retain source and policy freshness metadata.
