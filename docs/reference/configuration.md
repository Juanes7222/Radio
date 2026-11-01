# Configuration

Configuration has two homes, and mixing them up is the most common source of
"it works locally but not in production".

- **Environment variables** describe the machine and the secrets: ports, URLs,
  credentials, filesystem paths. Read once at import by `src/config/*.config.ts`.
- **Station settings** describe editorial choices: how many announcements per
  day, how old a backup may be before it is a problem, which voice to use. Stored
  in `station_settings` and editable from the panel.

If a value is a fact about the deployment, it is an env var. If an operator would
reasonably want to change it without a restart, it belongs in the catalog.

## Required environment variables

These throw at import time (`requiredEnv`). A missing one exits the process
before the server listens, which is deliberate: failing at boot is better than
failing on the first listener request.

| Variable | Config file | Purpose |
| --- | --- | --- |
| `PUBLIC_URL` | `app.config.ts` | Public backend URL. Normalized to `https://` if no scheme is given. |
| `PANEL_SECRET` | `app.config.ts` | Shared secret for `/panel-api/*` (`x-panel-secret`) |
| `JWT_SECRET` | `auth.config.ts` | Signs panel sessions, 12 h TTL |
| `AZURACAST_URL` | `azuracast.config.ts` | AzuraCast base URL |
| `AZURACAST_API_KEY` | `azuracast.config.ts` | Privileged AzuraCast API key |
| `AZURACAST_STATION_ID` | `azuracast.config.ts` | Station shortcode or numeric id |
| `WEBHOOK_SECRET` | `webhook.config.ts` | `x-webhook-secret` for callbacks |
| `WORKER_AUTH_SECRET` | `workers.config.ts` | Shared secret in the worker `register` message |

Because config is read at import, `src/index.ts` loads Infisical first and then
dynamically imports everything else. A script that imports `config` outside that
flow needs the same variables present.

## Runtime and ports

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3001` | HTTP API |
| `WS_PORT` | `3001` | Worker WebSocket. **Must differ from `PORT`** or the second listener fails with `EADDRINUSE`. |
| `TIMEZONE` | `UTC` | Station time zone used by schedules, day keys and cron |
| `JOB_DISPATCH_INTERVAL_MS` | `2000` | How often pending jobs are offered to workers |
| `WORKER_HEARTBEAT_TIMEOUT_MS` | `60000` | A worker silent longer than this is pruned |
| `STATION_NAME` | `Radio` | Used in TTS templates and the session payload |

## AzuraCast

| Variable | Default | Notes |
| --- | --- | --- |
| `AZURACAST_PLAYLIST_ID` | empty | General/varied content playlist. Guarded against being turned into a bumper target. |
| `AZURACAST_NEWS_PLAYLIST_ID` | empty | Destination for news videos |
| `AZURACAST_NEWS_FOLDER_PATH` | `/var/azuracast/stations/1/media/NOTICIAS` | Folder the cleanup job prunes |
| `AZURACAST_PUBLIC_URL` | value of `AZURACAST_URL` | Origin the browser can reach, used to rewrite stream and media URLs |

## Voice and announcements

Most of this moved into the settings catalog. What remains is infrastructure.

| Variable | Default | Notes |
| --- | --- | --- |
| `KOKORO_URL` | — | Fallback TTS service; also available as `voice.kokoroUrl` |
| `LIQUIDSOAP_HARBOR_HOST` | — | Host of the Liquidsoap harbor |
| `LIQUIDSOAP_HARBOR_PORT` | `8005` | Harbor port used to push the announcement |
| `LIQUIDSOAP_MOUNT_POINT` | `/announcements` | Harbor mount |
| `LOCUTOR_STREAMER_USER` | — | Legacy; the live value is `announcements.streamerUser` |
| `LOCUTOR_STREAMER_PASSWORD` | — | Legacy; the live value is the encrypted singleton row |
| `LOCUTOR_BEDS_DIR` | `../packages/assets/audio` | Instrumental beds |
| `LOCUTOR_BED_VOLUME` | `0.15` | Bed level under the voice |
| `LOCUTOR_ANNOUNCEMENTS_PER_HOUR` | `2` | Legacy default, superseded by `announcements.perDay` |
| `LOCUTOR_DEFAULT_VOICE` | — | Legacy default voice label |
| `LOCUTOR_DEFAULT_SPEED` | `1.0` | Speed applied when the template has none |
| `TTS_REQUEST_TIMEOUT_MS` | — | Provider request timeout |
| `TTS_MAX_TEXT_LENGTH` | — | Ceiling before a template is rejected |
| `ELEVENLABS_BASE_URL` | `https://api.elevenlabs.io` | |
| `ELEVENLABS_API_KEYS` | empty | Legacy pool. Once `provider_api_keys` has rows, this is ignored. |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | Also `voice.elevenLabsModel` |
| `ELEVENLABS_VOICE_IDS` | empty | `label=id,label=id`. Also `voice.voiceMap` |
| `ELEVENLABS_DEFAULT_VOICE_ID` | empty | Also `voice.defaultVoiceId` |
| `ELEVENLABS_OUTPUT_FORMAT` | `mp3_44100_128` | Also `voice.elevenLabsOutputFormat` |
| `ELEVENLABS_STABILITY` | `0.5` | Also `voice.elevenLabsStability` |
| `ELEVENLABS_SIMILARITY_BOOST` | `0.75` | Also `voice.elevenLabsSimilarity` |
| `ELEVENLABS_QUOTA_COOLDOWN_MINUTES` | — | How long a key parked for quota stays out |
| `ELEVENLABS_TRANSIENT_COOLDOWN_MINUTES` | `2` | Cooldown for 429/5xx/timeout |
| `ELEVENLABS_SUBSCRIPTION_CACHE_MINUTES` | — | Balance cache lifetime |

The voice labels stored on templates are provider-neutral (`ef_dora`,
`em_alex`). `voiceMap` translates them to ElevenLabs ids; when the map has no
entry for a label, the default voice id is used.

## Programs

| Variable | Default | Notes |
| --- | --- | --- |
| `PROGRAMS_ROOT_FOLDER` | `PROGRAMAS` | Root of the program library in AzuraCast |
| `PROGRAMS_ASSET_DIR` | `program-assets` | Intro/outro storage, relative to the storage tree |
| `PROGRAMS_ART_DIR` | `program-art` | Artwork storage |
| `PROGRAMS_TEMP_DIR` | `<tmp>/radio-programs` | Composed drafts awaiting publish |
| `PROGRAMS_SYNC_INTERVAL_MINUTES` | `5` | Archive check cadence |
| `PROGRAMS_SYNC_CRON` | `*/5 * * * *` | Cron form of the same |
| `PROGRAMS_PLAY_GRACE_MINUTES` | `3` | Grace before "gone from the playlist" counts as aired |
| `PROGRAMS_MAX_EPISODE_MINUTES` | `180` | Composition ceiling |
| `PROGRAMS_LOUDNESS_TARGET` | `-16` | Integrated LUFS target |
| `PROGRAMS_LOUDNESS_CEILING` | `-1.5` | True-peak ceiling in dBFS |
| `PROGRAMS_LOUDNESS_MAX_GAIN` | `24` | Cap on the applied gain |
| `PROGRAMS_DRAFT_TTL_HOURS` | `12` | Unpublished drafts are swept after this |

## Bumpers, workers, processing, live relay

| Variable | Default | Notes |
| --- | --- | --- |
| `BUMPERS_ASSET_DIR` | — | Intro/outro storage for multi-file programs |
| `BUMPERS_SYNC_CRON` | `*/5 * * * *` | Reconciliation cadence |
| `MAX_VIDEO_DURATION_SECONDS` | — | Rejects long videos before download |
| `MAX_RETRY_ATTEMPTS` | — | Processing job retries |
| `JOB_DEADLINE_HOURS` | — | Age at which a job is abandoned |
| `TEMP_DOWNLOAD_DIR` | — | Worker scratch space |
| `LIVE_ICECAST_HOST` | host of the AzuraCast public URL | |
| `LIVE_ICECAST_PORT` | `8000` | |
| `LIVE_ICECAST_MOUNT` | `/<stationId>` | |
| `LIVE_MAX_SESSION_MINUTES` | `240` | Safety cap on a browser DJ session |
| `LIVE_RECONNECT_GRACE_SECONDS` | `20` | Grace before the relay is dropped |
| `FFMPEG_PATH` | `ffmpeg` | Binary used by the relay |

## Email, push, logs, GeoIP, backups

| Variable | Default | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER` | — | `smtp` or `brevo` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | — | SMTP transport |
| `BREVO_API_KEY` | — | Brevo transport |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | — | Sender identity |
| `EMAIL_RECIPIENTS` | empty | Health alerts |
| `PRAYER_EMAIL_RECIPIENTS` | empty | New petition notifications |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | — | FCM and Firebase Auth admin |
| `HEALTH_PUSH_TOKENS` | empty | FCM tokens that receive health alerts; listener devices are never notified |
| `HEALTH_DISK_MOUNT_PATH` | `/var/azuracast` | Filesystem watched by the disk check |
| `ADMIN_WHITELIST` | empty | Emails allowed to bootstrap into the panel |
| `SUPERADMIN_EMAIL` | empty | Email promoted to SUPERADMIN on first login |
| `GEOIP_*` | see `geoip.config.ts` | MaxMind/DB-IP paths, endpoints, cache TTLs, update cron |
| `PM2_OUT_FILE` / `PM2_ERROR_FILE` / `NGINX_*_LOG` / `POSTGRES_LOG_FILE` / `DOCKER_CONTAINER_*` | — | Sources shown in the panel log viewer |
| `BACKUP_DIR` | `/var/backups/radio` | Local bundle directory |
| `BACKUP_LOG_FILE` | `/var/log/radio-backup.log` | Backup log read by the panel |
| `SECRETS_ENCRYPTION_KEY` | — | 32 bytes hex or base64. Without it, stored voice keys and the streamer password cannot be decrypted. |
| `YOUTUBE_API_KEY` | — | Required for channel polling; without it a channel stays `unverified` |
| `FB_VERIFY_TOKEN` | — | Facebook webhook verification |

## Station settings (panel-editable)

Declared in `backend/src/modules/settings/settings.catalog.ts`. Adding an entry
there is the whole change: no migration, because `station_settings` stores only
`key` and `value` as text and the catalog parses it.

### `identity`

| Key | Type | Default |
| --- | --- | --- |
| `station.timezone` | text | `America/Bogota` |

### `health`

| Key | Type | Default | Restart |
| --- | --- | --- | --- |
| `health.emailEnabled` | boolean | `true` | no |
| `health.pushEnabled` | boolean | `false` | no |
| `health.diskMinFreePercent` | number | `15` | no |
| `health.checkIntervalMinutes` | number | `2` | **yes** |
| `health.nowPlayingSilenceSeconds` | number | `900` | no |
| `health.backupMaxAgeHours` | number | `26` | no |
| `health.snapshotMaxAgeHours` | number | `2` | no |

The interval is frozen into the cron expression when the job registers, so it is
the one watchdog value that needs a restart.

### `announcements`

| Key | Type | Default |
| --- | --- | --- |
| `announcements.enabled` | boolean | `true` |
| `announcements.perDay` | number | `12` |
| `announcements.maxPerHour` | number | `2` |
| `announcements.activeFromHour` | number | `0` |
| `announcements.activeToHour` | number | `24` |
| `announcements.minGapMinutes` | number | `20` |
| `announcements.retryIntervalMinutes` | number | `5` |
| `announcements.programRetries` | number | `3` |
| `announcements.stuckLiveMinutes` | number | `5` |
| `announcements.respectLiveStreamer` | boolean | `true` |
| `announcements.respectScheduledPrograms` | boolean | `true` |
| `announcements.streamerUser` | text | empty |
| `announcements.bedsDir` | text | `../packages/assets/audio` |
| `announcements.bedVolume` | number | `0.15` |
| `announcements.trailingSilenceSeconds` | number | `3` |

The streamer password is not here. It lives encrypted in
`announcement_streamer_credentials` and is write-only from the panel.

### `voice`

| Key | Type | Default |
| --- | --- | --- |
| `voice.provider` | text | `auto` |
| `voice.elevenLabsModel` | text | `eleven_multilingual_v2` |
| `voice.elevenLabsStability` | number | `0.5` |
| `voice.elevenLabsSimilarity` | number | `0.75` |
| `voice.elevenLabsOutputFormat` | text | `mp3_44100_128` |
| `voice.defaultVoiceId` | text | empty |
| `voice.voiceMap` | text | empty (`label=id,label=id`) |
| `voice.kokoroUrl` | text | `http://localhost:8880` |

`voice.provider` values: `auto` tries ElevenLabs then falls back to Kokoro,
`elevenlabs` does not fall back (so an incomplete configuration fails visibly),
`kokoro` saves quota on purpose.

## Secrets in production

Production values live in Infisical (`docs/infisical-setup.md`), loaded by
`@radio/infisical-config` before any config module is imported. `.env` is the
local fallback and is gitignored.

Two migrations from environment to database were run and are worth knowing
because the environment names still exist and are now inert:

- `pnpm --filter @radio/backend youtube-channels:backfill` copied
  `YOUTUBE_CHANNEL_IDS` and `YOUTUBE_CHANNEL_NOTICES` into `YouTubeChannel`.
  Both variables were removed; the tables are the configuration now.
- `pnpm --filter @radio/backend voice-keys:backfill` encrypted
  `ELEVENLABS_API_KEYS` into `provider_api_keys`. Once that table has rows, the
  environment pool is no longer used.

## Frontend configuration

| Variable | Where | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | web, browser | Empty means same origin. Must be empty or an absolute `http(s)` URL; anything else throws at startup. |
| `VITE_API_PROXY_TARGET` | web, dev server only | Where Vite forwards during `pnpm dev`. Never reaches the bundle. |
| `VITE_MAINTENANCE` | web | `true` renders the maintenance page for every route |
| `EXPO_PUBLIC_BACKEND_URL` | mobile | Must be host-reachable: `http://10.0.2.2:3000` on the Android emulator, the LAN IP on a device |

`VITE_API_BASE_URL` and `VITE_API_PROXY_TARGET` are independent, and that is the
point: to run the frontend locally against production, set `VITE_API_BASE_URL=`
(empty) and `VITE_API_PROXY_TARGET=https://www.lavozverdad.com`. Requests stay
same-origin, so CORS does not apply, cookies are not third-party, and SSE plus
`live-relay` keep working.
