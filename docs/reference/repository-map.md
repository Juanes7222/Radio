# Repository map

Where everything lives, and what each place owns. Read this before your first
search; almost every "where is X" question is answered here.

## Top level

```
Radio/
├── apps/
│   ├── web/                  Listener site + admin panel (React 19 + Vite 7)
│   └── mobile/               Listener app (React Native 0.86 + Expo 57)
├── backend/                  Express API, worker WS server, cron jobs
├── packages/
│   ├── api/                  @radio/api   shared Axios client and pure helpers
│   ├── types/                @radio/types shared contracts and constants
│   ├── assets/               logos, audio beds, Bible XML (git submodule)
│   └── infisical-config/     @radio/infisical-config secret loader
├── worker/                   Windows worker + Electron installer (git submodule)
├── scripts/                  setup, deploy, backup/restore, nginx tree
├── scraping/                 one-off Python data collection, not part of the app
├── docs/                     this documentation suite
├── ecosystem.config.cjs      PM2 process definition
├── docker-compose.dev.yml    backend + web in containers for development
├── turbo.json                task graph (build, dev, lint, test, typecheck)
└── pnpm-workspace.yaml       workspace globs and dependency overrides
```

`worker/` and `packages/assets/` are separate repositories. A clone without
`--recurse-submodules` gets empty directories, and two things break: the Bible
reader has no corpus to seed, and the worker cannot be built.

## Backend

```
backend/
├── prisma/
│   ├── schema/               19 *.prisma files, combined by the Prisma CLI
│   │   ├── main.prisma       generator + datasource (sqlite, file:../dev.db)
│   │   └── ...               one file per domain, see reference/data-model.md
│   └── schema/migrations/    46 migration folders (--schema prisma/schema)
├── storage/                  local runtime files (program assets, art, notices)
├── tests/                    Vitest, see explanation/testing-strategy.md
└── src/
    ├── index.ts              bootstrap: env → Infisical → settings → scheduler
    ├── server.ts             HTTP listen + /live-relay upgrade
    ├── app.ts                Express assembly and every route mount
    ├── swagger.ts            generates src/swagger-output.json on build
    ├── config/               one module per domain, aggregated by index.ts
    ├── infrastructure/       Prisma client, Firebase, email, Infisical
    ├── shared/               logger, errors, storage, pure utils
    ├── jobs/scheduler.ts     the single place crons are registered
    ├── scripts/              backfills run by hand (youtube, voice keys)
    └── modules/              27 feature modules, each owning routes+services+jobs
```

A module is the unit of change. If you are adding an endpoint, a scheduled job or
a table's business rules, it goes inside one of the 27 directories. Nothing
outside that directory should need to know the feature exists, with two
exceptions: `app.ts` mounts the router, and `jobs/scheduler.ts` registers the job.

## Web app

```
apps/web/
├── src/
│   ├── main.tsx              providers + the entire route table
│   ├── App.tsx               the home page (listener console), not the router
│   ├── config.ts             API_BASE_URL and apiUrl(), the only URL builder
│   ├── index.css             :root public tokens + .admin-theme overrides
│   ├── pages/                route components; admin/ is the panel
│   ├── components/           admin, bible, feedback, layout, notices,
│   │                         player, prayer, ui (shadcn), ui-custom
│   ├── hooks/                useAdminApi, useAdminAuth, useGlobalAudio,
│   │                         useAzuraCast, useStationStatus, ...
│   ├── contexts/             AudioPlayerContext
│   ├── lib/                  format, artwork switch, station-day keys
│   ├── config/               seo.config.ts, the SEO single source of truth
│   └── content/              static copy and content fixtures
├── vite/                     seoPlugin (per-route head tags + sitemap)
├── tests/                    design, perf, routing, settings, youtube, ...
└── PRODUCT.md                product truth for the public surfaces
```

Two surfaces share one bundle but not one theme: the public site uses `:root`
tokens, the panel redeclares all of them under `.admin-theme`. A component that
looks right in one and wrong in the other is usually a token that only exists in
one scope.

## Mobile app

```
apps/mobile/
├── app/                      Expo Router file-based routes
│   ├── _layout.tsx           providers: audio, prayer answers, notifications
│   ├── (tabs)/               index, schedule, request, prayer, social
│   ├── prayer/[id].tsx       one petition + its answer
│   ├── prayer-history.tsx    the listener's own petitions
│   ├── feedback.tsx          opinions, reached from the Redes tab
│   └── +not-found.tsx
├── components/               alarm, bible, icons, notices, options,
│                             player, prayer, ui
├── hooks/                    useAudioPlayer, useSleepTimer, useBible,
│                             usePrayerAnswers, useProgramNotify, ...
├── lib/                      device, prayer, formatMedia, time,
│                             ssePolyfill, noticeStorage
├── constants/                theme tokens mirrored from the design system
├── modules/                  native modules
├── assets/                   icons, splash, fonts
├── tests/                    design guardrails + the SSE polyfill
├── app.json                  Expo config (runtimeVersion policy: appVersion)
└── eas.json                  build and update channels
```

`app/` is routing only. Anything reusable belongs in `components/`, `hooks/` or
`lib/`, because Expo Router treats every file under `app/` as a route.

## Shared packages

| Package | What it owns | Who imports it |
| --- | --- | --- |
| `@radio/api` | Axios calls to the public API, `rewriteLocalhostUrls`, `toSameOriginMediaUrls`, `mergeConsecutiveScheduleItems`, `submitFeedback` | web, mobile |
| `@radio/types` | `AdminPermission`, API response contracts, `FEEDBACK_LIMITS`, catalog types | backend, web, mobile |
| `@radio/assets` | logo, audio beds, Bible XML corpus | backend, web |
| `@radio/infisical-config` | loads secrets before config is imported | backend |

The backend imports `@radio/types` for permissions and for the shapes it
serializes. Web and mobile import `@radio/api` so a request is implemented once.

## Scripts and infrastructure

```
scripts/
├── setup.sh                  provisions a Debian server end to end (once)
├── deploy.sh                 release with audit gate, health check, rollback
├── radio-backup.sh           WAL-safe SQLite snapshot + R2 upload + pruning
├── radio-restore.sh          verified restore with a pre-restore copy
├── radio-backup.service      systemd unit (05:00 server time)
├── radio-backup.timer        systemd timer for the unit above
├── radio-backend.service     the backend systemd unit
├── restart.sh / start.sh / stop.sh
├── lib.sh                    shared bash helpers
├── design-review/            the design:review CLI used by agents
└── nginx/
    ├── radio-global.conf     zones, CORS map, SPA route map
    ├── radio-site.conf       public site server block
    ├── domains/              lavozverdad.com and vozyverdad.com
    └── snippets/             proxy, CORS, TLS, caching, uploads
```

## Where to look for what

| Question | Start at |
| --- | --- |
| Which module answers this endpoint? | `backend/src/app.ts` mount list, then `reference/backend-modules.md` |
| Why did a job run at 03:30? | `backend/src/jobs/scheduler.ts` |
| Where is this setting defined? | `backend/src/modules/settings/settings.catalog.ts` |
| Where does this env var come from? | `backend/src/config/<domain>.config.ts` |
| Which permission guards a panel page? | the module's `.routes.ts` plus `packages/types/src/admin.ts` |
| Why is the player reconnecting? | `apps/web/src/hooks/useGlobalAudio.ts`, `packages/api/src/api.ts` |
| Why is the panel orange here and purple there? | `.admin-theme` in `apps/web/src/index.css` |
| Why does the app show a badge? | `apps/mobile/hooks/usePrayerAnswers.tsx` |
| How is a release shipped? | `scripts/deploy.sh` |
| What breaks if I edit AzuraCast by hand? | `explanation/known-traps.md` |

## Processes at runtime

| Process | Port | Entry point |
| --- | --- | --- |
| HTTP API + `/live-relay` upgrade | `PORT` (default 3001) | `backend/src/server.ts` |
| Worker WebSocket server | `WS_PORT` (default 3001) | `backend/src/modules/workers/workerServer.ts` |
| Cron scheduler | in-process | `backend/src/jobs/scheduler.ts` |
| Vite dev server | 5173 | `pnpm dev:web` |
| Expo dev server | 8081 | `pnpm dev:mobile` |

`PORT` and `WS_PORT` both default to `3001`. Leaving both unset makes the second
listener fail with `EADDRINUSE`; the examples set `3000` and `3001`.
