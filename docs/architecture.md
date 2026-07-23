# Architecture

The browser loads the React Router SPA from Nginx. Domain services in `client/src/lib/api/operations.ts` call versioned Express endpoints through the shared Axios client; TanStack Query owns server state and React Hook Form owns forms.

The API flow is routes → controllers → services → repositories → Prisma → MySQL. Controllers translate HTTP only, services own orchestration and transactions, and repositories are the only database boundary. Public and internal compatibility requests use dedicated adapters while retaining their established URL and response contracts.

Access JWTs expire after 15 minutes. Rotating refresh tokens expire after 14 days, are stored as hashes, and support family revocation and reuse detection. Existing CRM sessions can be exchanged during the compatibility period.

Redis backs rate limits, distributed schedule locks, cache/security state, and BullMQ. API and worker processes are separate. Cron schedules enqueue idempotent work; they do not perform business processing in the API process. Socket.IO is optional and disabled by default.

Uploads are stored through the server storage boundary on the shared upload volume. Existing `/uploads/*` URLs remain valid. Nginx proxies APIs, uploads, sitemaps, and optional realtime traffic and serves the SPA with history fallback.
