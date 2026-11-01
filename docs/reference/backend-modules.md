# Backend modules

`backend/src/modules/` holds 27 modules. Each one owns its routes, services and
jobs, so a feature is added or removed inside a single directory. Two files
outside the module know about it: `src/app.ts` mounts the router and
`src/jobs/scheduler.ts` registers the cron.

## Anatomy of a module

A typical module has some subset of these files. The names are conventions, not
requirements, but a module that renames them makes the next reader slower.

| File | Responsibility |
| --- | --- |
| `<name>.routes.ts` | HTTP contract: parse, validate, call a service, shape the response. Thin. |
| `<name>.admin.routes.ts` | The same for panel-only endpoints, usually behind `router.use(requireAuth, requirePermission(...))` |
| `<name>.service.ts` | Business rules and Prisma access for the feature |
| `<sub>.service.ts` | One collaborator per concern (AzuraCast, ffmpeg, source resolution) |
| `<name>.validation.ts` | Pure input validation returning `{ ok: true, data } \| { ok: false, error }` in Spanish |
| `<name>.job.ts` | The cron body plus its `register...Job()` function |
| `<name>.types.ts` | Types shared inside the module only |
| `<name>.constants.ts` | Thresholds, labels and permission names |

## Module index

| Module | What it owns | Mounted at | Permission | Cron |
| --- | --- | --- | --- | --- |
| `auth` | Google sign-in, JWT sessions, admin user CRUD, `requireAuth`/`requirePermission`/`requireSuperAdmin` | `/admin-api/auth`, `/admin-api/users` | public login, `requireSuperAdmin` for users | — |
| `azuracast` | Now playing, schedule, art, song requests, uploads, panel proxy, listener history, news folder cleanup | `/api`, `/admin-api`, `/admin-api/upload`, `/panel-api`, `/admin-api/listeners` | public except upload (`upload`) and listeners (`dashboard`); panel proxy uses `x-panel-secret` | folder cleanup 07:00/13:00/19:00, listener sampling every 5 min |
| `backups` | Backup status, log, manual run | `/admin-api/backups` | `requireSuperAdmin` | daily 05:05 |
| `bible` | Translations, books, chapters, search, reading of the day | `/api/bible` | public | — |
| `bumpers` | Intro/outro pinned to an AzuraCast playlist for multi-file programs | `/admin-api/bumpers` | `programs` (reused) | reconcile every 5 min |
| `catalog` | Exports the station catalog (songs, books, videos) used by the generated public pages | build-time script `catalog:export` | — | — |
| `devices` | Device registry, FCM tokens, program subscriptions, zones, push campaigns, GeoIP | `/api/devices`, `/admin-api/devices` | public write, `devices` for admin | GeoIP update Tue/Fri 03:00 |
| `djs` | DJ streamer assignments and the live relay status/stop | `/admin-api/djs` | `streaming` | — |
| `feedback` | Listener opinions inbox | `POST /api/feedback`, `/admin-api/feedback` | public post, `feedback` for admin | — |
| `health` | Watchdog checks, alerts, remediation, public aggregate status | `/admin-api/health/watchdog`, `/api/health/public` | `dashboard` for admin | every 2 min |
| `internal` | Test-only dispatch endpoints for workers | `/internal` | loopback only (nginx) | — |
| `live` | Live status SSE for listeners, live admin status/clear | `/live-status`, `/admin-api/live` | public read, `streaming` for admin | — |
| `liveRelay` | Browser DJ relay over WebSocket, re-encoded to Icecast | `/live-relay` upgrade on the main HTTP server | `live` or `streaming` in the handshake | — |
| `locutor` | TTS announcements: templates, voice engine, audio bank, slot planner, harbor playback | `/admin-api/locutor`, `/admin-api/locutor/announcement` | `locutor` | slot planning daily 00:01, playback loop |
| `notices` | In-app notices, image and video libraries, preview | `/api/notices`, `/admin-api/notices` | public read, `notices` for admin | media cleanup 04:15 |
| `notifications` | Programs offered as push subscriptions, program reminder job | `/api/notification-programs`, `/admin-api/notification-programs` | public read, `devices` for admin | every 5 min |
| `playback` | Local mirror of the AzuraCast playback history | `/admin-api/playback` | `dashboard` | every 5 min |
| `prayer` | Prayer requests, admin moderation, SSE events, answer receipts | `POST /api/prayer` and `/api/prayer`, `/admin-api/prayer` | public write, `prayer` for admin | — |
| `programs` | Outside-produced programs: episodes, ffmpeg composition, slot finder, archive | `/admin-api/programs` | `programs` | archive every 5 min |
| `rotation` | Daily playlist rotations, Bible reading source resolution | `/admin-api/rotations` | `rotations`, `reading.history` for history | 03:30 |
| `schedule` | Schedule categories and program reminders | `/admin-api/schedule-categories` | `schedule.categories` | notify every 5 min |
| `settings` | Station settings catalog, change audit, encrypted voice keys | `/admin-api/settings`, `/admin-api/settings/voice-keys` | `settings`; writes that change secrets are `requireSuperAdmin` | — |
| `systemJobs` | Catalog of runnable system jobs and manual triggers | `/admin-api/jobs` | `jobs` | — |
| `systemLogs` | Log sources, tail, SSE stream | `/admin-api/logs` | `logs` | — |
| `webhook` | Facebook live pass-through callbacks | `/webhook` | `x-webhook-secret` | — |
| `workers` | Worker registry, delivery pool, processing jobs, binary releases | `/admin-api/workers` (REST) plus the WS server on `WS_PORT`; releases at `/admin/worker-releases` and `/workers/updates/*` | `youtube` for panel reads, `x-worker-secret` for the worker API | recovery every 5 min |
| `youtube` | Watched channels, uploads polling, ingest, Atom webhook | `/admin-api/youtube` (webhook first, admin after) | `youtube` | channel poll every 15 min |

## Details worth knowing per module

**`auth`** — the middleware reloads the admin user from the database on every
request, so deactivating an account or changing permissions takes effect
immediately. `requireAuth` rejects a token whose `tv` claim does not match the
stored `tokenVersion`. There is no password anywhere: the only login is a
Firebase ID token from a verified Google account.

**`azuracast`** — the largest module and the only one with four routers. It
contains the AzuraCast client (`azuracast.client.ts`), the public surface
(`public.routes.ts`), the authenticated panel proxy (`panel.routes.ts`, guarded
by `x-panel-secret` rather than a JWT), uploads, listener history and the news
folder cleanup. `proxy.routes.ts` is a narrow, permission-checked passthrough for
`/admin-api/nowplaying` used by the panel's station status provider.

**`locutor`** — split into three layers that are easy to confuse. `tts/` is the
voice engine (provider chain, key pool, voice map). `announcementPlan.service.ts`
decides *when*. `playback.job.ts` decides *whether right now is still a good
moment* and then streams the file into Liquidsoap's harbor through
`streamer.service.ts`. The panel reads all of it through `announcement.routes.ts`.

**`programs`** — the only module that runs ffmpeg on the server for content
(not for streaming). `program.audio.service.ts` composes, `program.temp.ts` owns
the draft directory, `program.episode.service.ts` owns the state machine,
`program.slotFinder.service.ts` picks a free window against every playlist
schedule item.

**`workers`** — `workerServer.ts` is the WebSocket endpoint; `workerPool.ts` is
the in-memory state of who is connected; `jobDispatcher.ts` claims jobs, handles
`job_done`/`job_error` and recovers stale ones; `releases.service.ts` stores the
ZIP artefacts and verifies SHA-256.

**`health`** — `health.checks.ts` holds the seven checks, `health.service.ts`
holds the state machine (dedup, backoff, remediation), `health.job.ts` runs the
cycle. Only AutoDJ restart is automatic, and it re-checks for a live streamer
immediately before acting.

**`settings`** — the catalog in `settings.catalog.ts` is the single source of
truth for every station setting: key, label, section, type, default, range and
`requiresRestart`. Adding a setting is a catalog entry, not a migration, because
`station_settings` stores only `key`/`value`. `settings.cache.ts` hydrates the
values at boot and `settings.view.ts` builds the panel payload.

**`internal`** — test-only dispatch endpoints, reachable only from loopback
because nginx denies everything else. Do not expose it.

## Where a request enters

Every mount lives in `backend/src/app.ts`. Two ordering rules are load-bearing
and commented there:

1. The YouTube webhook router must be mounted **before** the YouTube admin
   router. The admin router applies `requireAuth` to everything below it, so the
   reversed order makes the hub receive `401` and never verify the subscription.
2. `/admin-api/settings/voice-keys` must be mounted **before**
   `/admin-api/settings`, because both share a prefix and the child route owns
   its own permissions.

`app.set("trust proxy", 1)` assumes exactly one nginx hop. See
"Behind nginx" in `explanation/architecture.md`.
