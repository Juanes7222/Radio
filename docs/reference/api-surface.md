# API surface

Every route the backend answers, grouped by mount point as declared in
`backend/src/app.ts`. The auth column names the actual guard, not an intention.

Legend: **public** means no credential; **deviceId** means the caller proves
ownership with a bearer capability; **JWT** means `Authorization: Bearer` from
the panel login; **panel secret** means the `x-panel-secret` header; **webhook
secret** means `x-webhook-secret`; **worker secret** means `x-worker-secret`.

## `/api` — listener data

Served by `modules/azuracast/public.routes.ts`. Responses are shaped for a
listener: no station credentials, no internal ids beyond what the client needs.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/nowplaying` | public | Cached now-playing payload |
| GET | `/search` | public | Library search for song requests |
| GET | `/schedule` | public | Requires `start` and `end`; categories merged in |
| GET | `/schedule/categories` | public | Cached category list |
| GET | `/station/:stationId/art/:artId` | public | Tries three candidate art ids, `404` if none resolve |
| POST | `/requests/:songId` | public | Proxies the request to AzuraCast |
| POST | `/station/nowplaying/update` | webhook secret | AzuraCast now-playing callback |

## `/api/bible`, `/api/prayer`, `/api/feedback`, `/api/devices`, `/api/notices`, `/api/health`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/bible/reading/today` | public | `null` when no rotation ran today |
| GET | `/api/bible/translations` | public | Published translations only |
| GET | `/api/bible/books` | public | Requires `translation` |
| GET | `/api/bible/chapters` | public | Requires book |
| GET | `/api/bible/chapter` | public | Verses of one chapter |
| GET | `/api/bible/search` | public | Full-text search |
| POST | `/api/prayer` | public | Creates a petition; no rate limit (known gap) |
| GET | `/api/prayer/my/:deviceId` | deviceId | `{ rows, unreadAnswerCount }` |
| GET | `/api/prayer/:id` | deviceId or JWT | `deviceId` is optional for older app versions; when sent, ownership is enforced |
| POST | `/api/prayer/:id/answer-read` | deviceId | Stamps `answerReadAt`; wrong device gets `404` |
| POST | `/api/prayer/:id/read` | public | Legacy unread marker |
| GET | `/api/prayer/stream` | ticket | SSE; the ticket comes from the authenticated endpoint below |
| GET | `/api/prayer` | JWT `prayer` | Admin list with filters |
| POST | `/api/prayer/bulk/read` | JWT `prayer` | Bulk unread marker |
| POST | `/api/prayer/bulk/status` | JWT `prayer` | Bulk estado |
| POST | `/api/prayer/bulk/delete` | JWT `prayer` | Bulk delete |
| POST | `/api/prayer/events/ticket` | JWT `prayer` | Issues the one-shot SSE ticket |
| PUT | `/api/prayer/:id` | JWT `prayer` | Answer and estado |
| DELETE | `/api/prayer/:id` | JWT `prayer` | Delete one |
| POST | `/api/feedback` | public | Validated; `consent: true` required |
| GET | `/api/feedback` | JWT `feedback` | Paginated inbox with counts |
| PUT | `/api/feedback/:id` | JWT `feedback` | Estado only |
| POST | `/api/feedback/:id/read` | JWT `feedback` | Unread marker |
| DELETE | `/api/feedback/:id` | JWT `feedback` | Delete |
| POST | `/api/devices` | public | Registers `deviceId`, updates token and subscriptions |
| PUT | `/api/devices/:deviceId/token` | deviceId | FCM token |
| PUT | `/api/devices/:deviceId/subscriptions` | deviceId | Program subscriptions |
| GET | `/api/notices/active` | public | Active notices for this audience |
| GET | `/api/notification-programs` | public | Programs the app offers as subscriptions |
| GET | `/api/health/public` | public | `{ status, checkedAt }` only |

Prayer and feedback admin endpoints share the public mount prefix. They are
guarded per route, not by `router.use`, so a new public route added to the same
file is not accidentally protected — and a new admin route is not accidentally
open. Check the guard on the line you edit.

## `/admin-api/auth`, `/admin-api/users`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/admin-api/auth/google` | Firebase ID token in body | Returns the panel JWT (12 h) |
| GET | `/admin-api/auth/me` | JWT | Reloads the session from the database |
| POST | `/admin-api/auth/logout` | JWT | Client-side token discard |
| GET | `/admin-api/users` | SUPERADMIN | Admin user list |
| POST | `/admin-api/users` | SUPERADMIN | Create an admin |
| PATCH | `/admin-api/users/:id` | SUPERADMIN | Role, permissions, active flag |
| POST | `/admin-api/users/:id/revoke` | SUPERADMIN | Bumps `tokenVersion` |
| DELETE | `/admin-api/users/:id` | SUPERADMIN | Delete |

Login is rate limited to 30 attempts per 10 minutes per IP.

## `/admin-api` — station and panel

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/admin-api/nowplaying` | JWT `schedule` | Narrow passthrough for the panel status provider; station status itself is `/panel-api/status` |
| GET | `/admin-api/schedule-categories` | JWT `schedule.categories` | |
| POST/PUT/DELETE | `/admin-api/schedule-categories[/:id]` | JWT `schedule.categories` | |
| GET | `/admin-api/listeners/history` | JWT `dashboard` | Listener samples for the dashboard chart |
| GET | `/admin-api/playback/log` | JWT `dashboard` | Chronological playback log |
| GET | `/admin-api/playback/audios` | JWT `dashboard` | Grouped per audio, `order=plays\|recent\|first` |
| GET | `/admin-api/playback/filters` | JWT `dashboard` | Playlist names in the window |
| GET | `/admin-api/jobs` | JWT `jobs` | Catalog of runnable system jobs |
| POST | `/admin-api/jobs/:key/run` | JWT `jobs` | Run one now; some require confirm |
| GET | `/admin-api/logs/sources` | JWT `logs` | Available log files |
| GET | `/admin-api/logs` | JWT `logs` | Paginated log read |
| GET | `/admin-api/logs/tail` | JWT `logs` | Tail |
| GET | `/admin-api/logs/stream` | JWT `logs` | SSE |
| GET | `/admin-api/backups` | SUPERADMIN | Status, run state, retained bundles |
| GET | `/admin-api/backups/log` | SUPERADMIN | Last run log |
| POST | `/admin-api/backups/run` | SUPERADMIN | Spawns the script; `409` when already running |
| GET | `/admin-api/health/watchdog` | JWT `dashboard` | Checks, alerts, actions |
| POST | `/admin-api/health/watchdog/run` | JWT `dashboard` | Force one cycle |
| GET | `/admin-api/health` | public | Plain liveness plus aggregate status |
| GET | `/admin-api/settings` | JWT `settings` | Sections built from the catalog |
| PUT | `/admin-api/settings` | JWT `settings` | Applies and audits |
| POST | `/admin-api/settings/reset` | JWT `settings` | Drops stored values |
| GET | `/admin-api/settings/voice-keys` | JWT `settings` | Masked keys plus pool state |
| POST/DELETE | `/admin-api/settings/voice-keys[/:id]` | SUPERADMIN | Write or remove a key |
| POST | `/admin-api/settings/voice-keys/test` | SUPERADMIN | One-shot synthesis |

## `/admin-api/upload`, `/panel-api`, `/live-status`, `/admin-api/live`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/admin-api/upload` | JWT `upload` | Multipart MP3 upload to AzuraCast |
| GET | `/admin-api/upload/recent` | JWT `upload` | Recently uploaded files |
| POST | `/admin-api/upload/rescan` | JWT `upload` | Ask AzuraCast to rescan |
| DELETE | `/admin-api/upload/:id` | JWT `upload` | Delete a media file |
| GET | `/panel-api/status` | panel secret | Station status from AzuraCast |
| POST | `/panel-api/autodj/start` | panel secret | |
| POST | `/panel-api/autodj/stop` | panel secret | |
| GET | `/live-status/stream` | public | SSE frames of live state |
| GET | `/live-status/` | public | Current snapshot |
| GET | `/admin-api/live/status` | JWT `streaming` | |
| POST | `/admin-api/live/clear` | JWT `streaming` | Clears a stuck live state |

## `/admin-api/djs`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/admin-api/djs/mine` | JWT `streaming` | The caller's assignments |
| GET | `/admin-api/djs` | JWT `streaming` | All assignments |
| POST | `/admin-api/djs/assignments` | JWT `streaming` | |
| PATCH | `/admin-api/djs/assignments/:id` | JWT `streaming` | |
| DELETE | `/admin-api/djs/assignments/:id` | JWT `streaming` | |
| GET | `/admin-api/djs/relay/status` | JWT `streaming` | |
| POST | `/admin-api/djs/relay/stop` | JWT `streaming` | |

The relay audio itself is not here: it is the `/live-relay` WebSocket upgrade on
the main HTTP server.

## `/admin-api/locutor` — announcements

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/admin-api/locutor/templates` | JWT `locutor` | |
| POST/PUT/DELETE | `/admin-api/locutor/templates[/:id]` | JWT `locutor` | |
| POST | `/admin-api/locutor/templates/preview` | JWT `locutor` | Rendered text samples, no audio |
| GET | `/admin-api/locutor/audios` | JWT `locutor` | Audio bank |
| POST | `/admin-api/locutor/audios/generate/:templateId` | JWT `locutor` | |
| GET | `/admin-api/locutor/audios/:id/stream` | JWT `locutor` | |
| DELETE | `/admin-api/locutor/audios/:id` | JWT `locutor` | |
| POST | `/admin-api/locutor/audios/bulk/delete` | JWT `locutor` | |
| POST | `/admin-api/locutor/audios/purge` | JWT `locutor` | Removes rows, local files and AzuraCast files |
| POST | `/admin-api/locutor/live/release` | JWT `locutor` | Frees the harbor without cutting a human |
| GET | `/admin-api/locutor/status` | JWT `locutor` | Engine, key pool, balance |
| GET | `/admin-api/locutor/logs` | JWT `locutor` | |
| GET | `/admin-api/locutor/schedules` | JWT `locutor` | |
| POST | `/admin-api/locutor/generate-now/:hour` | JWT `locutor` | |
| POST | `/admin-api/locutor/play-now/:hour` | JWT `locutor` | |
| POST | `/admin-api/locutor/retry-upload/:audioId` | JWT `locutor` | |
| GET | `/admin-api/locutor/test-tts` | JWT `locutor` | Synthesizes a real phrase, reports the engine |
| GET | `/admin-api/locutor/announcement/settings` | JWT `locutor` | |
| PUT | `/admin-api/locutor/announcement/settings` | JWT `locutor` | Write-only streamer password |
| GET | `/admin-api/locutor/announcement/live-state` | JWT `locutor` | Would it announce right now, and why |
| GET | `/admin-api/locutor/announcement/day-analysis` | JWT `locutor` | Free and busy windows |
| GET | `/admin-api/locutor/announcement/scheduled-playlists` | JWT `locutor` | |
| GET | `/admin-api/locutor/announcement/plan/preview` | JWT `locutor` | |
| GET | `/admin-api/locutor/announcement/plan/slots` | JWT `locutor` | Persisted plan |
| GET | `/admin-api/locutor/announcement/run-log` | JWT `locutor` | |
| POST | `/admin-api/locutor/announcement/plan/rebuild` | JWT `locutor` | |
| POST | `/admin-api/locutor/announcement/toggle` | JWT `locutor` | |

## `/admin-api/programs`, `/admin-api/bumpers`, `/admin-api/rotations`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET/POST | `/admin-api/programs` | JWT `programs` | List, create |
| GET/PUT/DELETE | `/admin-api/programs/:id` | JWT `programs` | |
| POST/DELETE | `/admin-api/programs/:id/artwork` | JWT `programs` | Default artwork |
| POST/DELETE | `/admin-api/programs/:id/assets/:kind` | JWT `programs` | `intro` or `outro` |
| GET | `/admin-api/programs/:id/episodes` | JWT `programs` | |
| POST | `/admin-api/programs/:id/episodes/prepare` | JWT `programs` | Compose only, leaves a draft |
| GET | `/admin-api/programs/:id/schedule` | JWT `programs` | |
| GET | `/admin-api/programs/:id/slot` | JWT `programs` | Next free window |
| POST | `/admin-api/programs/:id/slot/check` | JWT `programs` | |
| POST | `/admin-api/programs/:id/sync` | JWT `programs` | Detect aired episodes |
| POST | `/admin-api/programs/episodes/:episodeId/publish` | JWT `programs` | Upload the draft |
| GET | `/admin-api/programs/episodes/:episodeId/preview` | JWT `programs` | Streams the draft |
| GET | `/admin-api/programs/episodes/:episodeId` | JWT `programs` | |
| POST | `/admin-api/programs/episodes/:episodeId/played\|queued` | JWT `programs` | Manual status |
| DELETE | `/admin-api/programs/episodes/:episodeId` | JWT `programs` | |
| GET/POST | `/admin-api/bumpers` | JWT `programs` | |
| PUT/DELETE | `/admin-api/bumpers/:id` | JWT `programs` | |
| POST/DELETE | `/admin-api/bumpers/:id/assets/:kind` | JWT `programs` | |
| POST | `/admin-api/bumpers/:id/reconcile` | JWT `programs` | |
| GET/POST | `/admin-api/rotations` | JWT `rotations` | |
| GET | `/admin-api/rotations/history` | JWT `reading.history` | |
| GET/PUT/DELETE | `/admin-api/rotations/:id` | JWT `rotations` | |
| POST | `/admin-api/rotations/:id/run` | JWT `rotations` | |
| GET | `/admin-api/rotations/:id/runs` | JWT `rotations` | |
| GET | `/admin-api/rotations/:id/source` | JWT `rotations` | Canonical position, next chapters, unresolved |
| POST | `/admin-api/rotations/:id/align` | JWT `rotations` | Move cursor to a book/chapter and run |

The episode routes come before `/:id` in `program.routes.ts` on purpose: a
literal `episodes` segment would otherwise be captured as an id.

## `/admin-api/notices`, `/admin-api/devices`, `/admin-api/notification-programs`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET/POST | `/admin-api/notices` | JWT `notices` | |
| PUT/DELETE | `/admin-api/notices/:id` | JWT `notices` | |
| POST | `/admin-api/notices/preview` | JWT `notices` | |
| POST/GET | `/admin-api/notices/images` | JWT `notices` | Upload, list |
| DELETE | `/admin-api/notices/images/:id` | JWT `notices` | |
| POST/GET | `/admin-api/notices/videos` | JWT `notices` | |
| DELETE | `/admin-api/notices/videos/:id` | JWT `notices` | |
| GET | `/admin-api/devices` | JWT `devices` | Paginated registry |
| GET | `/admin-api/devices/zones` | JWT `devices` | |
| GET | `/admin-api/devices/recalc-stats` | JWT `devices` | |
| POST | `/admin-api/devices/recalc-zones` | JWT `devices` | |
| PUT | `/admin-api/devices/:deviceId/zone` | JWT `devices` | Manual zone |
| POST | `/admin-api/devices/send-notification` | JWT `devices` | Push campaign |
| POST | `/admin-api/devices/preview-notification` | JWT `devices` | Audience preview |
| GET | `/admin-api/devices/notification-logs` | JWT `devices` | |
| GET | `/admin-api/devices/notifications-stats` | JWT `devices` | |
| GET/POST | `/admin-api/notification-programs` | JWT `devices` | |
| PUT | `/admin-api/notification-programs/:id` | JWT `devices` | |

## `/admin-api/youtube` and workers

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/admin-api/youtube/webhook` | public | Answers `hub.challenge` |
| POST | `/admin-api/youtube/webhook` | none | Atom notification; unknown channels are discarded |
| GET | `/admin-api/youtube/channels` | JWT `youtube` | |
| POST | `/admin-api/youtube/channels` | JWT `youtube` | |
| DELETE | `/admin-api/youtube/channels/:channelId` | JWT `youtube` | |
| POST | `/admin-api/youtube/channels/:channelId/resubscribe` | JWT `youtube` | |
| GET | `/admin-api/workers/workers` | JWT `youtube` | Connected workers |
| GET | `/admin-api/workers/jobs` | JWT `youtube` | Processing jobs |
| POST | `/admin-api/workers/jobs/:id/retry` | JWT `youtube` | |
| POST | `/admin-api/workers/upload` | worker secret | Worker uploads a finished video |
| POST/GET | `/admin/worker-releases` | JWT `jobs` | Upload and list release ZIPs |
| GET | `/workers/updates/latest` | worker secret | Version manifest |
| GET | `/workers/updates/:version/download` | worker secret | Binary with SHA-256 check |
| GET | `/admin-api/workers/workers/updates/latest` | worker secret | Alias kept for old clients |

## Infrastructure endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Liveness used by `deploy.sh` |
| GET | `/docs` | Swagger UI generated from `swagger-output.json` |
| GET/POST | `/webhook/facebook` | Facebook verification and live callbacks |
| GET/POST | `/internal/test-dispatch/*` | Test-only; nginx denies anything but loopback |
| GET | `/media/notices/*`, `/api/media/notices/*` | Optimized notice images, immutable cache |
| GET | `/media/notice-videos/*`, `/api/media/notice-videos/*` | Notice videos |
| GET | `/media/program-art/*`, `/api/media/program-art/*` | Program artwork, 1 day cache |

The `/api/media/*` aliases exist because nginx only proxies `/api/*` to the
backend; `apiUrl()` in `apps/web/src/config.ts` rewrites `/media/...` to
`/api/media/...` for exactly this reason.
