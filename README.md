# MooNsConfig

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An open travel operations platform for building visual itineraries, managing travel inventory,
working with suppliers, and running the customer journey from lead to post-trip support.

MooNsConfig combines animated and brochure-style route maps with packages, vendors, hotels, cars,
flights, cruises, experiences, quotes, bookings, CRM, marketing, and multi-tenant SaaS operations.
The application is a TypeScript monorepo with a React SPA, an Express API, MySQL, Prisma, Redis,
BullMQ, and Nginx.

> This project is under active development. Core modules run locally without paid integrations.
> AI, email, telephony, payments, SSO, live flight data, WhatsApp, and other provider-backed
> features require their own credentials and remain disabled or fail closed when unconfigured.

## Why MooNsConfig?

Travel teams often build itineraries in one tool, maintain suppliers in another, prepare quotes
manually, and track customers in a generic CRM. MooNsConfig brings those workflows into one
extensible operating system:

- Design polished static route maps and cinematic animated journeys.
- Build packages with day-by-day itineraries, pricing, media, inclusions, and SEO content.
- Maintain vendor, stay, vehicle, destination, cruise, flight, and experience inventory.
- Send RFQs, organize supplier outreach, and follow vendor conversations.
- Move leads through quotes, approvals, bookings, payments, invoices, refunds, and support.
- Operate isolated travel-company workspaces from a multi-tenant SaaS control plane.

## Feature tour

### Route maps and animated journeys

- Country-aware brochure map generator powered by D3 Geo and world map data.
- Search and geocode itinerary stops, or enter exact latitude and longitude.
- Flight, road, rail, and cruise legs with distinct paths, colors, and transport icons.
- OSRM-backed road geometry, editable curves, draggable stops, label placement, and distance
  summaries.
- Smooth zoom, pan, map framing, legends, endpoint transport, and custom transport icons.
- Import/export route JSON, export PNG or SVG, and save generated maps to the application.
- Package-level cinematic route animator for shareable animated journey exports.

### Packages and itineraries

- Package directory with regional, seasonal, trending, and text filters.
- Overview, pricing, builder, itinerary, route, content, media, and SEO workspaces.
- Day-by-day activities, overnight stops, coordinates, and road/flight/rail/cruise transfers.
- B2B cost, B2C selling price, margin planning, inclusions, exclusions, gallery, and hero media.
- Publish/unpublish controls, public lounge links, RFQs, and supplier association.
- Optional AI package architect and market estimates when a supported model is configured.

### Vendors and supplier operations

- Searchable supplier directory with category, contact, WhatsApp, coverage, and notes.
- Vendor outreach campaigns using reusable email templates.
- RFQ workflows for packages and inventory.
- Inbox synchronization, threaded supplier conversations, replies, and outreach queues.
- Research/source metadata and verification status for operational review.

### Hotels, stays, and cars

- Hotels, resorts, and other stays with destination, address, features, and multimedia galleries.
- Linked vendors, net cost, margin, selling price, and B2B/B2C comparison.
- Vehicle inventory with pickup/drop-off coverage, seats, luggage, contact details, images, and
  pricing.
- Search, region filters, source verification, editing, and RFQ email assistance.

### Broader travel operations

- Flights, cruises, destinations, experiences, themes, and catalog management.
- Leads, follow-ups, client profiles, sales pipeline, journey management, and incident desk.
- Quotes with reusable PDF templates, approvals, bookings, invoices, escrow, refunds, and promo
  codes.
- Campaigns, audiences, automations, banners, promotions, Travel Hub content, visa content, and
  SEO.
- Traveller Hub for proposals, trips, participants, services, payments, documents, and messages.
- Role-based module permissions, audit trails, MFA-sensitive actions, and security controls.

### Platform and automation

- Platform database plus an isolated logical database for each travel company.
- Tenant registration, provisioning, lifecycle, plan, quota, billing, backup, and operator
  controls.
- Redis-backed rate limits, distributed locks, caching, Socket.IO, and BullMQ jobs.
- Transactional outbox and idempotent travel automation workers.
- Governed Maya assistant with read-only defaults, approval-bound writes, audit records, and an
  external-write kill switch.
- Optional SSO, object storage, malware scanning, payments, email/IMAP, telephony/SMS, WhatsApp,
  live flight status, and inventory providers.

See [the travel operating system guide](docs/travel-operating-system.md) and
[the commercial SaaS architecture](docs/commercial-saas.md) for deeper design details.

## Technology

| Layer               | Technology                                                    |
| ------------------- | ------------------------------------------------------------- |
| Web application     | React 19, React Router, Vite, TypeScript, Tailwind CSS        |
| UI and data         | Radix UI, TanStack Query, React Hook Form, Zod                |
| Maps and exports    | D3 Geo, TopoJSON, world-atlas, OSRM, Nominatim, html-to-image |
| API                 | Node.js 24, Express 5, Joi, Socket.IO                         |
| Data                | MySQL 8.4, Prisma 6                                           |
| Jobs and cache      | Redis 7.4, BullMQ                                             |
| Edge and containers | Nginx, Docker Compose                                         |
| Quality             | ESLint, Prettier, Vitest, Supertest, Husky                    |

## Architecture

```text
Browser
  |
  v
React/Vite SPA ---- Socket.IO
  |
  v
Nginx reverse proxy
  |
  v
Express API ---- Redis ---- BullMQ workers
  |
  +---- platform Prisma client ---- moonsconfig_platform
  |
  `---- tenant Prisma client ------ isolated tenant database
```

The API follows `routes -> controllers -> services -> repositories -> Prisma -> MySQL`. Background
workers are separate from the API process. Tenant context is resolved before tenant data access,
and provider-dependent workflows report unconfigured capabilities instead of fabricating results.

Read [docs/architecture.md](docs/architecture.md) for the runtime design.

## Quick start with Docker

This is the recommended path because it starts MySQL, Redis, the API, worker, client, and Nginx
together.

### Prerequisites

- [Git](https://git-scm.com/)
- [Node.js 24](https://nodejs.org/) and npm 11 or newer
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose

### 1. Clone and enter the project

```bash
git clone https://github.com/schowdary75/moonsconfig.git
cd moonsconfig
```

### 2. Generate a safe local environment

```bash
npm run setup:env
```

This copies `.env.example` to the ignored `.env` file and generates unique local database
passwords, signing secrets, encryption keys, and an initial administrator password. It refuses to
overwrite an existing `.env`.

Save the administrator password printed in the terminal. The generated `.env` is local-only and
must never be committed.

### 3. Build and start the stack

```bash
docker compose up --build -d
docker compose ps
```

The API container applies the platform and tenant migrations during startup.

### 4. Create the initial local administrator

```bash
docker compose exec api npm run prisma:seed
```

Open <http://localhost:8080> and sign in with the email and password printed by
`npm run setup:env`.

Useful local endpoints:

| Endpoint                                 | Purpose                   |
| ---------------------------------------- | ------------------------- |
| <http://localhost:8080>                  | Application through Nginx |
| <http://localhost:8080/api/v1/health>    | API health                |
| <http://localhost:8080/api/v1/readiness> | Dependency readiness      |
| <http://localhost:8080/api/docs>         | Swagger UI                |
| <http://localhost:8080/api/openapi.json> | OpenAPI document          |

### 5. View logs or stop

```bash
docker compose logs -f api worker
docker compose down
```

`docker compose down` keeps the named database, Redis, upload, and log volumes. To avoid accidental
data loss, this guide does not recommend the volume-removal command.

## Run natively for development

Use this path when you want fast hot reload and already have MySQL 8.4 and Redis 7 available
locally.

### 1. Install dependencies and create `.env`

```bash
npm ci
npm run setup:env
```

If `.env` already exists, the setup command stops without changing it.

### 2. Prepare MySQL

Create the application and platform databases. Replace the example password with the generated
`DATABASE_PASSWORD` from your local `.env`:

```sql
CREATE DATABASE moonsconfig
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE moonsconfig_platform
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'moon_user'@'localhost' IDENTIFIED BY 'your-generated-DATABASE_PASSWORD';
GRANT ALL PRIVILEGES ON moonsconfig.* TO 'moon_user'@'localhost';
GRANT ALL PRIVILEGES ON moonsconfig_platform.* TO 'moon_user'@'localhost';
FLUSH PRIVILEGES;
```

The provisioning URL uses a privileged local MySQL account because tenant creation requires
database and user administration. Never expose that account to browser code or use the local
example configuration in production.

Start Redis on `127.0.0.1:6379`, or update `REDIS_URL` in `.env`.

### 3. Generate Prisma clients, migrate, and seed

```bash
npm run prisma:generate
npm run prisma:deploy:platform
npm run prisma:deploy
npm run prisma:seed --workspace @moonsconfig/server
```

### 4. Start the app

For the client and API:

```bash
npm run dev:app
```

For the client, API, and background worker:

```bash
npm run dev
```

The Vite application runs at <http://localhost:5174> and proxies `/api`, `/uploads`, and
`/socket.io` to the API at <http://localhost:4000>.

## Environment configuration

Use `.env.example` as the source of truth. Real `.env` files are ignored at the root and inside
both workspaces.

### Required core values

| Variable                           | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`                     | Main/initial tenant database                               |
| `PLATFORM_DATABASE_URL`            | Global identities, tenants, plans, and platform operations |
| `TENANT_DATABASE_BASE_URL`         | Template used to connect to tenant databases               |
| `TENANT_PROVISIONING_DATABASE_URL` | Privileged provisioning-only MySQL connection              |
| `TENANT_CREDENTIAL_ENCRYPTION_KEY` | Encrypts stored tenant database credentials                |
| `REDIS_URL`                        | Queues, rate limits, locks, cache, and realtime state      |
| `JWT_ACCESS_SECRET`                | Application access-token signing                           |
| `OPERATOR_JWT_SECRET`              | Platform-operator token signing                            |
| `AUTH_PASSWORD_PEPPER`             | Server-side password hardening value                       |
| `CORS_ORIGINS`                     | Exact comma-separated browser origins                      |

### Optional integrations

Leave optional values blank until you deliberately enable the related capability:

- AWS S3, CloudFront, Secrets Manager, and malware webhooks
- WorkOS SSO
- Razorpay and Zoho Books
- SMTP and IMAP
- Google OAuth, Gemini, and Google Ads
- Asterisk ARI and an SMS gateway
- Meta/WhatsApp
- Flight-status, travel-rules, insurance, and inventory providers

Never place a server credential in a `VITE_*` variable. Vite variables are compiled into browser
assets and are public by design.

## Commands

| Command                          | Purpose                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `npm run setup:env`              | Create an ignored local `.env` with generated development secrets |
| `npm run dev:app`                | Run client and API with hot reload                                |
| `npm run dev`                    | Run client, API, and worker                                       |
| `npm run build`                  | Build all workspaces                                              |
| `npm run lint`                   | Run workspace ESLint checks                                       |
| `npm run typecheck`              | Run TypeScript checks                                             |
| `npm test`                       | Run Vitest/Supertest suites                                       |
| `npm run format:check`           | Verify Prettier formatting                                        |
| `npm run prisma:generate`        | Generate tenant and platform Prisma clients                       |
| `npm run prisma:deploy`          | Apply tenant database migrations                                  |
| `npm run prisma:deploy:platform` | Apply platform database migrations                                |
| `npm run manifest:generate`      | Refresh the migration manifest                                    |
| `npm run docker:up`              | Build and run Docker Compose in the foreground                    |
| `npm run docker:down`            | Stop the Compose stack                                            |

## Project structure

```text
client/                 React application, route-map tools, pages, and UI
server/
  prisma/               Tenant schema, seed, and migrations
  prisma/platform/      Platform/control-plane schema and migrations
  src/                  API, domains, integrations, jobs, security, and workers
docs/                   Architecture, SaaS, migration, and travel-domain guides
infra/terraform/        AWS infrastructure templates
nginx/                  Reverse proxy and production edge configuration
scripts/                Workspace setup and migration helpers
docker-compose.yml      Complete local/production-like stack
```

Runtime uploads, logs, generated storage, local certificates, `.env` files, Terraform state and
variable files, database dumps, and debug captures are intentionally excluded from Git.

## Database and migration safety

- Use versioned Prisma migrations for shared or production databases.
- Back up the database and uploads before a production migration.
- Do not use destructive reset or schema-push commands against shared data.
- The seed is idempotent and only creates the configured initial administrator and missing role
  permissions.
- Existing restored databases require the baseline procedure in
  [docs/migration-runbook.md](docs/migration-runbook.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
Good starting points include route-map improvements, travel inventory adapters, tests,
accessibility, documentation, and provider integrations that fail safely when unconfigured.

Use GitHub Issues for reproducible bugs and focused feature proposals. Do not report security
vulnerabilities in a public issue; follow [SECURITY.md](SECURITY.md).

## License

MooNsConfig is available under the [MIT License](LICENSE).
