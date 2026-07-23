# MooNsConfig

[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111827)](https://react.dev/)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Security Policy](https://img.shields.io/badge/security-policy-2ea44f?style=flat-square&logo=github)](SECURITY.md)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-6f42c1?style=flat-square)](CONTRIBUTING.md)
[![GitHub Stars](https://img.shields.io/github/stars/schowdary75/moonsconfig?style=flat-square&logo=github&cacheSeconds=1800)](https://github.com/schowdary75/moonsconfig)
[![GitHub Forks](https://img.shields.io/github/forks/schowdary75/moonsconfig?style=flat-square&logo=github)](https://github.com/schowdary75/moonsconfig/forks)
[![GitHub Contributors](https://img.shields.io/github/contributors/schowdary75/moonsconfig?style=flat-square&logo=github)](https://github.com/schowdary75/moonsconfig/graphs/contributors)

An open, AI-assisted travel operating system for running the complete traveller journey—from the
first call or chat through itinerary curation, supplier pricing, proposals, booking, on-trip
operations, and post-trip support.

MooNsConfig brings Maya, a governed travel agent, together with RFQs, vendor outreach, autonomous
customer support, team chat, AI itinerary building, photo-to-trip curation, animated route maps,
packages, hotels, cars, flights, cruises, experiences, CRM, payments, and multi-tenant SaaS
operations. The application is a TypeScript monorepo with a React SPA, an Express API, MySQL,
Prisma, Redis, BullMQ, Socket.IO, and Nginx.

> This project is under active development. Core modules run locally without paid integrations.
> AI, email, telephony, payments, SSO, live flight data, WhatsApp, and other provider-backed
> features require their own credentials and remain disabled or fail closed when unconfigured.

## Why MooNsConfig?

Travel teams often build itineraries in one tool, maintain suppliers in another, prepare quotes
manually, and track customers in a generic CRM. MooNsConfig brings those workflows into one
extensible operating system:

- Let Maya answer calls and chats, recognize returning travellers, capture enquiries, search real
  inventory, arrange callbacks, and keep the CRM updated.
- Continue the lead journey with scheduled follow-ups across call, email, WhatsApp, and internal
  tasks, with staff-visible status and history.
- Turn a destination brief or inspiration photo into an editable day-by-day itinerary and activity
  collection.
- Design polished static route maps and cinematic animated journeys.
- Build packages with day-by-day itineraries, pricing, media, inclusions, and SEO content.
- Maintain vendor, stay, vehicle, destination, cruise, flight, and experience inventory.
- Let Maya compose detailed RFQs, contact selected suppliers, organize outreach queues, and follow
  vendor conversations through to reviewed inventory.
- Keep internal teams and customers connected through realtime chat, attachments, calls, support
  handover, and Maya-assisted responses.
- Move leads through quotes, approvals, bookings, payments, invoices, refunds, and support.
- Operate isolated travel-company workspaces from a multi-tenant SaaS control plane.

## From first enquiry to post-trip

1. **Capture the enquiry.** A traveller can enter through a lead form, customer chat, callback
   request, or an incoming phone call. Maya can recognize an existing caller, collect trip details,
   create or update the lead, and escalate urgent or complex requests.
2. **Discover and curate.** Search packages and live catalogue items, generate an itinerary from a
   destination brief, or upload an inspiration photo and turn its destination, mood, and activities
   into a trip blueprint.
3. **Build the itinerary.** Edit and reorder days, add activities, stays, rooms, cars, and transfers,
   attach coordinates, calculate pricing and margin, upload media, and generate the route map.
4. **Request supplier rates.** Select vendors, dates, hotels, and RFQ scope; use a reusable template
   or ask Maya to compose the request; review it and send it to multiple suppliers.
5. **Process vendor responses.** Track outbound and inbound threads, synchronize the vendor inbox,
   extract offered stays, cars, and packages into reviewable drafts, and approve verified inventory.
6. **Send the proposal.** Build a versioned quote from real catalogue and rate-card data, produce a
   branded PDF, collect lounge feedback or acceptance, and keep uncertain supplier-rate gaps
   clearly marked instead of inventing prices.
7. **Operate the trip.** Manage participants, services, payments, documents, messages, activity
   status, flight watches, incidents, recovery options, and customer updates from Journey Manager
   and Traveller Hub.
8. **Close the loop.** Keep support history, invoices, escrow, refunds, follow-ups, customer value,
   and post-trip conversations connected to the same traveller record.

## Feature tour

### Maya: autonomous travel agent with operational guardrails

- Asterisk ARI integration for answering incoming calls, greeting the traveller, listening to each
  turn, generating spoken replies, and continuing the conversation until hang-up.
- One shared Maya brain across voice, customer chat, staff chat, WhatsApp, and SMS-backed delivery.
- Caller recognition, real package and catalogue search, indicative quote lookup, lead capture,
  WhatsApp trip summaries, callback scheduling, and human escalation.
- End-of-call CRM journaling with the transcript, actions Maya completed, lead association, and
  last-contact time; call recordings can be reconciled, listed, streamed, and reviewed.
- Browser-based staff voice conversations with Maya inside Team Chat.
- A connected lead and follow-up timeline for calls, WhatsApp, email, quotes, meetings, outcomes,
  next actions, Maya-owned cadences, and human-owned queues from initial enquiry through conversion.
- Autonomous handling for open customer-support conversations assigned to Maya, including sensitive
  data redaction, urgent-travel acknowledgement, on-trip escalation, and a clean human
  takeover/handover path.
- Event-driven travel automation, disruption monitoring, refund-SLA review, durable retries,
  dead-letter handling, and a Maya Ops Center for provider readiness and pending actions.
- Real commercial boundaries: catalogue reads can run automatically, while external messages,
  booking changes, money movement, refunds, insurance, EMI, legal claims, and other sensitive
  actions can require explicit approval and recent MFA.
- Tenant, channel, and tool-level controls plus `MAYA_EXTERNAL_WRITES_ENABLED` as a deployment kill
  switch.

### Team chat and customer support

- Realtime staff roster, online presence, typing indicators, unread counts, desktop notifications,
  delivery/read state, reactions, pinned messages, groups, and chat history.
- Attachments and peer file transfer, plus WebRTC voice/video calls between team members.
- Maya appears inside Team Chat as an internal operations agent for verified staff and can also be
  reached through the in-browser voice interface.
- Guest and authenticated-customer support chat with request queues, staff acceptance, smart
  replies, ratings, callbacks, conversation closing, and searchable support history.
- Hand a customer conversation to Maya when the team is busy, monitor the live reply, and take it
  back at any time without losing context.

### AI itinerary builder and visual curation

- Generate a day-by-day itinerary from destination, duration, traveller profile, and package brief.
- Edit, add, remove, and reorder itinerary days; attach descriptions, cities, route locations,
  coordinates, transfers, time slots, and activities from the master catalogue.
- Upload an Instagram screenshot, Pinterest-style image, or travel photo to Visual AI; Maya derives
  the likely destination, travel mood, key activities, and a sample itinerary.
- Save a photo-generated blueprint directly into the Activities catalogue for reuse in packages.
- Upload package hero and gallery images, reorder media, animate galleries on storefront cards, and
  manage published service imagery from the shared Asset Library.
- Generate SEO titles, descriptions, keywords, pricing estimates, and package architecture when an
  AI provider is configured.

### RFQs, procurement, and vendor outreach

- Package-level RFQ builder for full itineraries, hotels, transport, and cruises, with one or more
  scopes in the same request.
- Required travel dates, destination-aware hotel selection, custom hotel requests, vendor
  selection, and multi-supplier dispatch.
- Maya-composed RFQ drafts or reusable email templates populated with package, itinerary, activity,
  inclusion, exclusion, stay, transfer, and pricing requirements.
- Preview and edit the subject and message before sending; every successful dispatch is added to
  the vendor communication history.
- Category-aware vendor outreach templates, batch queues, retry/error status, and communication
  timelines.
- Inbound email synchronization and thread recovery, with AI-assisted extraction of vendor stays,
  cars, and packages into pending inventory drafts.
- Human review before extracted supplier inventory is approved and given a selling price or margin.
- Custom quotes use real active rate cards; missing rates stay indicative and can raise supplier
  RFQs instead of presenting fabricated availability or pricing.

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
- Destination-aware catalogue loading for vendors, stays, rooms, activities, and cars.
- B2B cost, B2C selling price, margin planning, inclusions, exclusions, gallery, and hero media.
- Publish/unpublish controls, public lounge links, RFQs, and supplier association.
- Public itinerary feedback and approval through the customer lounge.

### Vendors and supplier operations

- Searchable supplier directory with category, contact, WhatsApp, coverage, and notes.
- Supplier association across packages, stays, cars, cruises, experiences, and other inventory.
- Direct email, WhatsApp, RFQ, and outreach workflows from the supplier workspace.
- Inbox synchronization, threaded conversations, manual replies, draft review, and outreach queues.
- Research/source metadata and verification status for operational review.

### Hotels, stays, and cars

- Hotels, resorts, and other stays with destination, address, features, and multimedia galleries.
- Linked vendors, net cost, margin, selling price, and B2B/B2C comparison.
- Vehicle inventory with pickup/drop-off coverage, seats, luggage, contact details, images, and
  pricing.
- Search, region filters, source verification, editing, and RFQ email assistance.

### Broader travel operations

- Flights, cruises, destinations, experiences, themes, and catalog management.
- Leads with ownership, priority analysis, notes, recordings, next actions, follow-up queues, call
  outcomes, WhatsApp banners, and AI-generated call/email/message scripts.
- Client profiles, sales pipeline, deal coaching, journey management, global broadcasts, activity
  status, and an incident desk.
- Versioned quotes with real catalogue lines, branded PDF templates, approvals, bookings, payment
  schedules, invoices, escrow, refunds, and promo codes.
- Traveller Hub for proposals, trips, participants, services, payments, wallet metadata, documents,
  messages, live status, and Maya SOS/recovery support.
- Campaigns, audiences, automations, banners, promotions, Travel Hub content, visa content, and
  SEO.
- AI analytics chat, lead-priority analysis, trend analysis, audience rules, campaign generation,
  banner copy, escrow reconciliation assistance, and marketing automation drafts.
- Customer registration and authentication, Google sign-in, email/phone verification, invitations,
  roles, module permissions, and user administration.
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

## One-command start for non-developers

The launcher installs the complete application stack inside Docker. You do **not** need to install
Node.js, npm, MySQL, Redis, Nginx, Prisma, or any project package on your computer.

The only prerequisite is:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows or macOS, or Docker
  Engine with the Docker Compose v2 plugin on Linux.

Docker itself must be installed separately because it requires operating-system administrator
approval and, on Windows or macOS, virtualization support. After Docker is installed, start it and
wait until it reports that the engine is running.

### Linux or macOS

From the cloned repository:

```bash
chmod +x start.sh stop.sh
./start.sh
```

### Windows

Start Docker Desktop, open the repository in **Git Bash**, and run:

```bash
./start.sh
```

You can also use WSL with Docker Desktop's WSL integration enabled:

```bash
cd /mnt/c/path/to/moonsconfig
./start.sh
```

PowerShell and Command Prompt do not run `.sh` files directly; use Git Bash or WSL for these two
commands.

### What `start.sh` does

On the first run it:

1. Checks that Docker and Docker Compose v2 are installed and running.
2. Uses Node 24 inside a temporary Docker container to create an ignored `.env` with unique local
   database passwords, signing secrets, encryption keys, and an administrator password.
3. Pulls and builds Node 24, MySQL 8.4, Redis 7.4, Nginx, the API, worker, and React application.
4. Starts the containers, applies both Prisma migration sets, and waits for every required service
   to become healthy.
5. Creates the initial administrator and role permissions.
6. Prints the application URL and local login details.
7. Stays open with live logs so the window does not close while you are using it.

Open <http://localhost:8080> when startup finishes. Pressing `Ctrl+C` closes only the live log
viewer—the application keeps running in Docker.

To stop everything without deleting the database, uploads, or Redis data:

```bash
./stop.sh
```

Run `./start.sh` again whenever you want to restart it. Existing configuration and data are reused.
For an unattended or background-only start, use `./start.sh --no-logs`.

> Keep `.env` private. It contains the local passwords printed by the launcher and is already
> excluded from Git. Do not delete it while keeping the Docker database volume, because the
> generated database password must continue to match that existing data.

## Manual Docker setup

Use these steps when you want to control each Docker command yourself. For the easiest setup, use
`./start.sh` above.

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

| Command                          | Purpose                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `./start.sh`                     | Install, configure, start, initialize, and follow the Docker stack |
| `./stop.sh`                      | Stop the Docker stack without deleting local data                  |
| `npm run setup:env`              | Create an ignored local `.env` with generated development secrets  |
| `npm run dev:app`                | Run client and API with hot reload                                 |
| `npm run dev`                    | Run client, API, and worker                                        |
| `npm run build`                  | Build all workspaces                                               |
| `npm run lint`                   | Run workspace ESLint checks                                        |
| `npm run typecheck`              | Run TypeScript checks                                              |
| `npm test`                       | Run Vitest/Supertest suites                                        |
| `npm run format:check`           | Verify Prettier formatting                                         |
| `npm run prisma:generate`        | Generate tenant and platform Prisma clients                        |
| `npm run prisma:deploy`          | Apply tenant database migrations                                   |
| `npm run prisma:deploy:platform` | Apply platform database migrations                                 |
| `npm run manifest:generate`      | Refresh the migration manifest                                     |
| `npm run docker:up`              | Build and run Docker Compose in the foreground                     |
| `npm run docker:down`            | Stop the Compose stack                                             |

## Project structure

```text
start.sh / stop.sh      One-command Docker launcher for non-developers
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

Original MooNsConfig source code is available under the [MIT License](LICENSE), copyright 2026
MooNsConfig. Third-party libraries, map data, hosted media, fonts, services, and container images
retain their own licenses and terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the
attribution and licensing guide.
