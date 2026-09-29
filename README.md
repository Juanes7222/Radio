<div align="center">
  <img src="./packages/assets/img/LOGO_COMPLETO_SINFONDO.png" alt="La Voz de la Verdad" height="92" />

  # La Voz de la Verdad

  **Self-hosted 24/7 Christian radio platform — streaming, listener apps, admin panel and self-healing operations**

  [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![Node](https://img.shields.io/badge/Node.js-%3E=22-3c873a?style=flat-square&logo=node.js)](https://nodejs.org)
  ![pnpm](https://img.shields.io/badge/pnpm-10.11.0-f69220?style=flat-square&logo=pnpm)
  ![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)
  ![Expo](https://img.shields.io/badge/Expo-57-000?style=flat-square&logo=expo)
  ![Express](https://img.shields.io/badge/Express-4.x-000?style=flat-square&logo=express)
  ![Prisma](https://img.shields.io/badge/Prisma-6.x-2d3748?style=flat-square&logo=prisma)

  <br />

  <a href="https://play.google.com/store/apps/details?id=com.lavozverdad.radio">
    <img src="https://play.google.com/intl/en/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" height="52" />
  </a>

  <br />

  [What it does](#what-it-does) · [Architecture](#architecture) · [Stack](#stack) · [Quick start](#quick-start) · [Configuration](#configuration) · [Operations](#operations) · [Reference](#reference)
</div>

---

A complete radio station platform, not just a player. AzuraCast keeps the audio on air 24/7; everything in this repository is the layer around it: the listener web app, the native mobile app, the admin panel, and the backend that turns YouTube channels into station content, voices the announcements, keeps an eye on the stream and restores itself when something breaks.

The listener surfaces are the visible product. The operational surface — worker orchestration, health watchdog, backups to object storage, zero-downtime deploys — is what makes it possible to run a station on a single small VPS without an on-site engineer.

## What it does

**For listeners**

- Live stream playback with quality selection (64/128/320 kbps), waveform visualization, Media Session controls and a sleep timer that keeps running in the background on mobile.
- Now-playing metadata with album art, song history and a "En vivo" badge whenever a human DJ is on air instead of AutoDJ.
- Weekly program schedule, integrated Bible reader with multiple translations, notices and announcements as full-screen overlays, image carousels and videos.
- Prayer requests, song requests against the AzuraCast library, and Facebook Live pass-through when the station is broadcasting there instead of on Icecast.
- PWA install, push notifications for favorite songs and program reminders, geo-aware timezone, and legal pages for terms, privacy, data treatment and cookies.

**For the station team**

- Full station console in the admin panel: playlists, uploads, rotations, schedule categories, DJ assignments, moderation queues, the audio bank, backup browser, log viewer and health overview.
- TTS announcements: hour-aware templates rendered by Kokoro, mixed over background beds, scheduled into safe time slots and pushed on air by connecting to Liquidsoap's harbor socket as a temporary streamer.
- YouTube ingestion: subscribe to channels, ingest new videos, download, extract metadata and publish them as station media — executed on worker nodes, not on the server.
- Browser-based live relay: a DJ streams from `/admin/live` and the backend re-encodes to Icecast with the station's own streamer credential, so it never reaches the browser.
- RBAC admin panel: Firebase sign-in, JWT sessions, database-backed roles and per-panel permissions.

**For operations**

- Distributed worker nodes over WebSocket: job queue, heartbeats, retries, per-node concurrency limits, binary auto-update with SHA-256 verification and an idle-only apply policy.
- Health watchdog: seven checks (AzuraCast, AutoDJ, workers, YouTube jobs, disk, backup, listener sampling) on a cron, alert de-duplication with retry backoff, and a single automatic remediation — restarting AutoDJ, guarded so it can never interrupt a live streamer.
- Nightly SQLite backups (WAL-safe) bundled with worker releases and notice media, uploaded to Cloudflare R2 with size verification and daily/weekly retention pruning; restore script with checksum and `integrity_check` verification.
- `setup.sh` provisions a fresh Debian server end to end; `deploy.sh` ships releases with an audit gate, health check and automatic rollback.

## Architecture

```
                            ┌──────────────────────────────────────┐
   listeners ──────────────▶│            AzuraCast                 │
   web · mobile · panel     │  Icecast ◀── AutoDJ (Liquidsoap)     │
                            │  playlists · schedules · media       │
                            └───────────────┬──────────────────────┘
                                            │ REST + webhooks
                      ┌─────────────────────┴─────────────────────┐
                      │              Backend (Express)            │
                      │  /api        public data for listeners    │
                      │  /admin-api  panel (Firebase + JWT)      │
                      │  /live-relay DJ browser relay (ffmpeg)   │
                      │  /webhook    AzuraCast / YouTube / FB    │
                      │  cron: TTS, watchdog, backups, cleanup  │
                      └──────┬───────────────────────┬───────────┘
                             │ SQLite (Prisma)       │ WebSocket
                             ▼                       ▼
                    ┌─────────────────┐   ┌──────────────────────────┐
                    │  Files + R2     │   │  Worker nodes (Windows)  │
                    │  media, notices │   │  yt-dlp · ffmpeg · updater│
                    │  daily backups  │   │  auto-update, WinSW      │
                    └─────────────────┘   └──────────────────────────┘
```

The backend is the only component that holds privileged credentials. AzuraCast API keys, the Icecast streamer password, webhook secrets and push credentials never leave the server; the web and mobile apps talk exclusively to the backend, which shapes each response for its audience.

The process opens two listeners: the HTTP API on `PORT` and the worker WebSocket server on `WS_PORT`. The browser DJ relay is not a third one — it is an HTTP upgrade handled by the main server at `/live-relay`, so it shares the API's port and origin.

## Stack

| Layer | Technology |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo, Node 22 |
| Backend | Express 4, Prisma 6, SQLite (WAL), `node-cron`, `ws` |
| Auth & push | Firebase Auth / FCM, JWT sessions, database-backed RBAC |
| Web | React 19, Vite 7, React Router 8, Tailwind 3.4, shadcn/ui (Radix), Framer Motion, Vitest |
| Mobile | React Native 0.86, Expo 57, Expo Router, Track Player, EAS Update |
| Streaming | AzuraCast (Icecast + Liquidsoap AutoDJ) |
| Media | `ffmpeg` / `fluent-ffmpeg`, `sharp`, `yt-dlp` on the workers |
| TTS | Kokoro (self-hosted HTTP service) |
| Secrets | Infisical SDK, `.env` fallback for local work |
| Email | Nodemailer (SMTP) and Brevo |
| Infra | Nginx + Let's Encrypt, systemd, PM2, Cloudflare R2, GeoLite2 (MaxMind) |

## Repository layout

```
.
├── apps/
│   ├── web/                  Listener site + admin panel (React/Vite)
│   └── mobile/               Native app (React Native/Expo)
├── backend/                  Express API, workers server, cron jobs
│   ├── prisma/schema/        28 models: content, jobs, notices, users
│   └── src/
│       ├── modules/          21 feature modules, each owning routes+services+jobs
│       ├── config/           Validated env, one module per domain
│       ├── shared/           logger, errors, utils
│       ├── infrastructure/   Prisma, Firebase, email, Infisical
│       └── jobs/             scheduler registration
├── packages/
│   ├── api/                  @radio/api — shared Axios client
│   ├── types/                @radio/types — shared types and constants
│   ├── assets/               logos, audio beds, Bible XML (submodule)
│   └── infisical-config/     Infisical loader
├── worker/                   Windows worker + Electron installer (submodule)
├── scripts/                  setup, deploy, backup/restore, Nginx tree
└── scraping/                 one-off data collection scripts (Python)
```

Each backend module owns its routes, services and jobs, so a feature is added or removed in one directory. The health watchdog, for example, is `modules/health/` and nothing outside it knows the checks exist.

## Quick start

> [!IMPORTANT]
> The backend talks to a real AzuraCast instance. The listener UI renders without one, but streaming, metadata, schedules and the whole admin panel will not.

### Prerequisites

- **Node.js** 22 (the web build needs `>= 22.22.0` for React Router 8)
- **pnpm** 10.11.0 — `corepack enable && corepack prepare pnpm@10.11.0 --activate`
- A reachable **AzuraCast** instance, and a **Firebase** project for auth and push
- Python 3 only if you need to run `scraping/`

### Install

```bash
git clone --recurse-submodules https://github.com/Juanes7222/Radio.git
cd Radio

pnpm install
pnpm --filter radio-admin-backend run prisma:generate
pnpm --filter radio-admin-backend run prisma:migrate
```

`--recurse-submodules` matters: the Bible XML corpus and the worker live in separate repositories.

### Configure

Copy the three templates and fill them in:

```bash
cp backend/.env.example      backend/.env
cp apps/web/.env.example     apps/web/.env
cp apps/mobile/.env.example  apps/mobile/.env
```

`backend/.env.example` is heavily commented and documents the full surface. The only values you cannot work without are `PUBLIC_URL`, `PANEL_SECRET`, `JWT_SECRET`, `WORKER_AUTH_SECRET` and an AzuraCast URL/station — missing ones throw at startup rather than failing later.

For production, put secrets in [Infisical](docs/infisical-setup.md) instead of the file. The backend loads them during bootstrap, before any module reads its config.

### Develop

```bash
pnpm dev              # everything (Turbo)
pnpm dev:backend      # API + workers server, port 3000
pnpm dev:web          # Vite, port 5173, proxies /api to the backend
pnpm dev:mobile       # Expo dev server
pnpm dev:docker       # backend + web in containers
```

The Vite proxy points at `VITE_API_BASE_URL`, so relative routes hit the same backend from any origin. Swagger UI is served at `/docs` while the backend is running.

## Configuration

Only the essentials here; every other knob is documented inline in `backend/.env.example`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `PUBLIC_URL` | Public backend URL, required | — |
| `PANEL_SECRET` | Admin panel shared secret, required | — |
| `JWT_SECRET` | Signs admin sessions (12h), required | — |
| `WORKER_AUTH_SECRET` | Authenticates worker nodes, required | — |
| `AZURACAST_URL` / `AZURACAST_STATION_ID` | Station coordinates | — |
| `AZURACAST_API_KEY` | Privileged AzuraCast access (Infisical) | — |
| `PORT` / `WS_PORT` | HTTP and worker WebSocket ports | `3001` / `3001` |
| `TIMEZONE` | Station timezone; drives schedules and cron | `UTC` |
| `KOKORO_URL` | TTS service for announcements | — |
| `YOUTUBE_CHANNEL_IDS` | Channels to ingest from | — |
| `EMAIL_RECIPIENTS` | Health alert recipients | — |
| `INFISICAL_*` | Remote secret loading | disabled |

> [!WARNING]
> `PORT` and `WS_PORT` both default to `3001`, so leaving them unset makes the second listener fail with `EADDRINUSE`. Set them explicitly — the examples use `3000` and `3001`.

The mobile app needs a host-reachable API URL, not `localhost`: `EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:3000` on the Android emulator, or your LAN IP on a physical device.

## Operations

### Migrations

Development uses `prisma migrate dev` and may reset the database when it detects drift. Production uses `prisma migrate deploy`, which only applies pending migrations. Never run `migrate dev` or `migrate reset` against a production database.

```bash
pnpm --filter radio-admin-backend run prisma:migrate:deploy
pnpm --filter radio-admin-backend run prisma:migrate:status
```

The schema lives in `prisma/schema/`. The npm scripts pass `--schema prisma/schema` explicitly, so prefer them over calling the Prisma CLI by hand.

### Deploy

```bash
sudo bash scripts/setup.sh --panel-pass <password> --certbot-email <email>   # once
sudo bash scripts/deploy.sh [--backend] [--frontend] [--force]
```

`setup.sh` installs system packages, Node, Nginx with TLS for both station domains, the systemd units and the backup timer. `deploy.sh` pulls, audits changed dependencies, builds, migrates, restarts, polls `/health` and restores the previous build if anything fails.

### Health and backups

The watchdog runs every 120 seconds. Only one remediation is automatic — restarting AutoDJ — and it re-checks for a live streamer immediately before acting, so it can never pull a DJ off the air. Every other failing check raises an alert by email or push with a direct link to the affected panel area, de-duplicated per check and retried with backoff.

`scripts/radio-backup.sh` runs daily at 05:00 from a systemd timer, takes a WAL-safe SQLite snapshot, bundles it with worker releases and notice media, and uploads to R2. `scripts/radio-restore.sh` verifies checksum and integrity before touching the live database, and keeps a pre-restore copy.

### Worker nodes

A worker is a Windows box running the bundled client plus `yt-dlp` and `ffmpeg`. It connects over WebSocket, reports its version and capacity, and only accepts jobs when idle. New releases are pushed from the admin panel, broadcast to connected nodes, verified by SHA-256, staged into `.pending`, and swapped in only when the node has no active job — so a release never interrupts processing.

## Reference

### Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `build` / `lint` | Turborepo tasks across all workspaces |
| `pnpm --filter @radio/web test` | Vitest suite (the web app is the only workspace with tests) |
| `pnpm --filter @radio/mobile build:android` | EAS build for Android |
| `pnpm --filter radio-admin-backend run build` | Prisma generate + Swagger + `tsc` |
| `pnpm --filter radio-admin-backend exec prisma migrate deploy` | Apply migrations |

### API surface

| Prefix | Audience |
| --- | --- |
| `/api` | Public: now playing, schedule, notices, programs |
| `/api/bible`, `/api/prayer`, `/api/devices`, `/api/health/public` | Public, feature-scoped |
| `/admin-api/*` | Panel: auth, users, playlists, uploads, live, YouTube, notices, jobs, logs, backups, health |
| `/live-status`, `/live-relay` | Stream status (SSE) and browser DJ relay (WebSocket) |
| `/webhook` | AzuraCast, YouTube and Facebook callbacks |
| `/panel-api` | AzuraCast panel proxy for authenticated sessions |
| `/docs` | Swagger UI |
| `/health` | Liveness probe used by the deploy script |

### Documentation

| File | Contents |
| --- | --- |
| [`docs/backend-context.md`](docs/backend-context.md) | Backend layout, conventions, watchdog and backup design |
| [`docs/frontend-context.md`](docs/frontend-context.md) | Admin design system, shared components, known design debt |
| [`docs/infisical-setup.md`](docs/infisical-setup.md) | Secret management |
| [`docs/legal/`](docs/legal) | Privacy, terms, data treatment and cookie policies |
| [`AGENTS.md`](AGENTS.md) | Contribution conventions for AI agents |

---

Built and operated by the [World Missionary Movement](https://lavozverdad.com) team in Colombia.
