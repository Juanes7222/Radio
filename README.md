<div align="center">
  <img src="./packages/assets/img/LOGO_COMPLETO_SINFONDO.png" alt="La Voz de la Verdad" height="96" />

  # La Voz de la Verdad

  **Christian radio station platform — 24/7 streaming with web, mobile, and admin dashboard**

  [![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
  [![Node](https://img.shields.io/badge/Node.js-%3E=20-3c873a?style=flat-square&logo=node.js)](https://nodejs.org)
  [![Express](https://img.shields.io/badge/Express-4.x-000?style=flat-square&logo=express)](https://expressjs.com)
  [![Prisma](https://img.shields.io/badge/Prisma-6.x-2d3748?style=flat-square&logo=prisma)](https://www.prisma.io)
  [![React Native](https://img.shields.io/badge/React_Native-0.79-61dafb?style=flat-square&logo=react)](https://reactnative.dev)
  [![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
  [![pnpm](https://img.shields.io/badge/pnpm-11.5.2-orange?style=flat-square&logo=pnpm)](https://pnpm.io)

  <br />

  <a href="https://play.google.com/store/apps/details?id=com.lavozverdad.radio"><!-- UPDATE: Replace with actual Play Store URL -->
    <img src="https://play.google.com/intl/en/badges/static/images/badges/en_badge_web_generic.png"
         alt="Get it on Google Play" height="60" />
  </a>

  <br />

  [Features](#features) · [Architecture](#architecture) · [Tech Stack](#tech-stack) · [Getting Started](#getting-started) · [Scripts](#scripts) · [Configuration](#configuration)

</div>

---

A complete online radio broadcasting platform that operates 24/7. It includes a web player for listeners, a mobile app, an admin dashboard for station management, automatic voice announcement generation (TTS), YouTube video processing, and a distributed worker system.

## Features

**Web & Mobile Player**
- High-quality audio streaming with multiple bitrate support (64/128/320 kbps)
- Waveform visualization and media session controls
- Real-time now-playing metadata with album art and progress tracking
- Live streamer detection — shows "En Vivo" when a human DJ is broadcasting
- Song request system with AzuraCast playlist search
- Favorites tracking with push notifications when a favorite song plays
- Sleep timer with configurable presets
- Weekly programming schedule viewer

**Admin Dashboard**
- Real-time streaming status and listener statistics
- Playlist, schedule, and upload management
- Prayer request moderation and email notifications
- Locutor (DJ) management system
- Google OAuth authentication with email whitelist

**Automation & Content Processing**
- Automatic hourly voice announcements using Kokoro TTS with time-slot awareness
- YouTube video ingestion — subscribe to channels, download, extract metadata, upload to AzuraCast
- Distributed worker nodes connected via WebSocket for video processing
- Scheduled audio playback with template-based announcements

**Additional Features**
- Integrated Bible reader with multiple translations
- Facebook Live stream detection and playback
- PWA support — installable on mobile and desktop
- Push notifications for favorite songs
- Dark/light mode
- Responsive design — mobile-first with touch-friendly controls

## Architecture

```
                        ┌──────────────────────────────────────────────────┐
                        │                 AzuraCast                        │
                        │  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
                        │  │ Icecast  │  │  AutoDJ  │  │   REST API   │    │
                        │  │ Streaming│  │Liquidsoap│  │   (public)   │    │
                        │  └──────────┘  └──────────┘  └──────────────┘    │
                        └──────────────────┬───────────────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            ▼
     ┌────────────────┐          ┌───────────────────┐       ┌──────────────────┐
     │   Web App      │          │    Backend        │       │   Mobile App     │
     │  (React/Vite)  │◄────────►│ (Express/Prisma)  │◄─────►│ (React Native)   │
     │                │          │                   │       │                  │
     │  Player UI     │          │  Auth (JWT/OAuth) │       │  Background      │
     │  Admin Panel   │          │  TTS Generation   │       │  Audio Playback  │
     │  Bible Reader  │          │  Schedule Engine  │       │  Sleep Timer     │
     │  Prayer System │          │  YouTube Ingest   │       │  Bible Reader    │
     └────────────────┘          └────────┬──────────┘       └──────────────────┘
                                          │
                                          │ WebSocket
                                          ▼
                               ┌─────────────────────┐
                               │  Worker Nodes       │
                               │  (Node.js/Electron) │
                               │                     │
                               │  yt-dlp + ffmpeg    │
                               │  Windows Service    │
                               └─────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Monorepo** | pnpm workspaces + Turborepo |
| **Backend** | Express 4.x, Prisma 6.x, SQLite |
| **Web Frontend** | React 19, Vite 7, Tailwind CSS 3.4, shadcn/ui, Framer Motion |
| **Mobile** | React Native 0.79, Expo 53, Expo Router, Track Player |
| **Streaming** | AzuraCast / Icecast |
| **TTS** | Kokoro (external service) |
| **Auth** | Google OAuth, JWT |
| **Validation** | Zod 4.x |
| **API Docs** | Swagger (swagger-autogen + swagger-ui-express) |
| **Worker** | Node.js, WebSocket (ws), yt-dlp, ffmpeg |
| **Worker Installer** | Electron + electron-builder (Windows NSIS) |
| **Secrets** | Infisical SDK |
| **Email** | Nodemailer, Brevo API |

## Project Structure

```
radio-monorepo/
├── apps/
│   ├── web/                    # React web app (listeners + admin)
│   │   ├── src/
│   │   │   ├── components/     # Player, Bible, Prayer, UI components
│   │   │   ├── contexts/       # AudioPlayerContext
│   │   │   ├── hooks/          # 16 custom hooks
│   │   │   ├── pages/          # Public pages + admin dashboard
│   │   │   └── types/          # TypeScript type definitions
│   │   └── public/             # PWA assets, favicons
│   │
│   └── mobile/                 # React Native / Expo app
│       ├── app/                # Expo Router pages (tabs)
│       ├── components/         # VinylDisc, PlayerControls, BiblePanel
│       ├── hooks/              # useAudioPlayer, useSleepTimer
│       └── service/            # PlaybackService for TrackPlayer
│
├── backend/                    # Express + Prisma API server
│   ├── prisma/                 # Schema + migrations (13 models)
│   ├── src/
│   │   ├── routes/             # 12 route modules
│   │   ├── services/           # AzuraCast, TTS, YouTube, scheduling
│   │   ├── jobs/               # Cron jobs (hourly, nightly, video)
│   │   ├── workers/            # WebSocket server for distributed workers
│   │   ├── middleware/         # JWT auth
│   │   └── lib/                # Prisma client, storage
│   └── data/                   # Bible data (SQLite)
│
├── packages/
│   ├── api/                    # Shared Axios client (@radio/api)
│   ├── types/                  # Shared TypeScript types (@radio/types)
│   ├── assets/                 # Shared assets (logos, Bible XML)
│   └── infisical-config/       # Infisical secret loader
│
├── worker/                     # Distributed processing worker
│   ├── worker/                 # Node.js worker (WebSocket client)
│   └── electron/               # Windows installer (Electron + NSIS)
│
├── scraping/                   # Utility scraping scripts
└── scripts/                    # Build and utility scripts
```

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **pnpm** 11.5.2 (install with `corepack enable && corepack prepare pnpm@11.5.2 --activate`)
- **AzuraCast** instance (for streaming)
- **Google OAuth** credentials (for admin authentication)

### Installation

```bash
# Clone the repository
git clone https://github.com/Juanes7222/Radio
cd radio-monorepo

# Install dependencies
pnpm install

# Generate Prisma client
cd backend
pnpm prisma:generate
cd ..

# Run database migrations
cd backend
pnpm prisma:migrate
cd ..
```

### Environment Setup

Create a `.env` file in the `backend/` directory with the required variables. See [Configuration](#configuration) for the full list.

### Development

```bash
# Start all services (web, backend, mobile)
pnpm dev

# Or start individual services:
pnpm dev:web       # React app on port 5173
pnpm dev:backend   # Express API on port 3001
pnpm dev:mobile    # Expo dev server
```

> [!TIP]
> The backend runs on port `3001` by default. The Vite dev server proxies `/api` requests to the backend automatically.

> [!NOTE]
> The web app requires a running AzuraCast instance for full functionality. Without one, the player UI will render but streaming and metadata features won't work.

## Scripts

### Root (Monorepo)

| Command | Description |
|---|---|
| `pnpm dev` | Start all workspaces in development mode |
| `pnpm build` | Build all workspaces |
| `pnpm lint` | Lint all workspaces |
| `pnpm dev:web` | Start web app only |
| `pnpm dev:mobile` | Start mobile app only |
| `pnpm dev:backend` | Start backend only |
| `pnpm dev:docker` | Start with Docker Compose |

### Backend (`radio-admin-backend`)

| Command | Description |
|---|---|
| `pnpm dev` | Generate Swagger docs + start with hot reload |
| `pnpm build` | Generate Swagger docs + compile with `tsc` |
| `pnpm prisma:generate` | Regenerate Prisma client |
| `pnpm prisma:migrate` | Run database migrations |

### Web (`@radio/web`)

| Command | Description |
|---|---|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Type-check + build for production |
| `pnpm lint` | Run ESLint |
| `pnpm preview` | Preview production build |

### Mobile (`@radio/mobile`)

| Command | Description |
|---|---|
| `pnpm dev` | Start Expo dev server |
| `pnpm android` | Run on Android device/emulator |
| `pnpm ios` | Run on iOS simulator |
| `pnpm build:android` | Build with EAS for Android |
| `pnpm build:ios` | Build with EAS for iOS |

## Configuration

### Required Environment Variables

| Variable | Description |
|---|---|
| `AZURACAST_URL` | AzuraCast server URL |
| `AZURACAST_API_KEY` | AzuraCast API key |
| `AZURACAST_STATION_ID` | Station ID to manage |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `JWT_SECRET` | Secret key for JWT tokens |
| `PUBLIC_URL` | Public-facing backend URL |
| `PANEL_SECRET` | Admin panel shared secret |
| `WORKER_AUTH_SECRET` | Worker node authentication secret |
| `WEBHOOK_SECRET` | AzuraCast webhook verification secret |

### Optional Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Backend port | `3001` |
| `VITE_API_BASE_URL` | API base URL for web app | `http://localhost:3001` |
| `KOKORO_URL` | Kokoro TTS service URL | — |
| `MEDIA_DIR` | Media storage directory | — |
| `TIMEZONE` | Server timezone | `UTC` |
| `STATION_NAME` | Station display name | — |
| `SMTP_*` / `BREVO_API_KEY` | Email configuration for prayers | — |
| `YOUTUBE_CHANNEL_IDS` | YouTube channel subscriptions | — |
| `INFISICAL_*` | Infisical secret management | — |

## API Documentation

Swagger documentation is auto-generated and available at `/api-docs` when the backend is running.

```bash
cd backend
pnpm dev
# Open http://localhost:3001/api-docs
```

## Database

The project uses **SQLite** via Prisma. The database file is located at `backend/prisma/dev.db`.

The schema includes 13 models covering:

- **Bible content** — translations, books, chapters, verses
- **YouTube ingestion** — videos, subscriptions, processing jobs
- **Worker orchestration** — nodes, jobs, protocol
- **Audio automation** — templates, generated audio, schedules, logs
- **Community** — prayer requests
