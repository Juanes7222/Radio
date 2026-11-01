# Glossary

Domain words as they are used in this repository. Several of them mean something
more specific here than in general radio vocabulary.

## Station and audio

**AzuraCast** — The self-hosted radio platform that runs the station: Icecast for
listening, Liquidsoap for the AutoDJ, plus playlists, schedule, streamers and the
media library. It is the source of truth for audio.

**AutoDJ** — Liquidsoap playing the scheduled playlists when no human is on air.
Restarting it is the only automatic remediation the watchdog performs.

**Harbor** — Liquidsoap's input socket (`LIQUIDSOAP_HARBOR_PORT`, default 8005)
where the backend pushes an announcement as a temporary live source. Only one
source can hold it at a time, and a human DJ competes for the same resource.

**Announcement (aviso)** — An hourly spoken segment: a rendered template, voiced
by TTS, mixed over an instrumental bed, pushed into the harbor.

**Slot** — One planned announcement time for the station day. Persisted as
`AnnouncementSlot` with status `pending | deferred | played | skipped | failed`.

**Live streamer** — A human connected to Icecast with an AzuraCast streamer
account. Announcements must never interrupt one.

**Live relay** — The browser-to-Icecast path at `/live-relay`. The panel sends
microphone audio; the backend runs ffmpeg as a source client with the station's own
streamer credentials.

**Mount** — An Icecast mount point (`/listen/la_voz_de_la_verdad/`). Listed in
`station.mounts[]`; those URLs must not be normalized to the page origin.

**Playlist** — An AzuraCast playlist. Its name is what appears as a schedule item
title, which is why schedule categories are matched by keyword instead of a column.

**Rotation** — A job that copies the next N audios of an ordered source into a
target playlist, then advances a cursor. Bible reading is a rotation with
`bibleMode`.

**Bumper** — An intro and/or outro pinned to a playlist that emits a multi-file
program. `glued` means AzuraCast merges the block into one track.

**Program** — Content produced outside the station team: an AzuraCast playlist plus
a pending and a played folder, with episodes uploaded from the panel.

**Episode** — One uploaded file of a program. `draft` means composed but not
published; the admin can preview it before it reaches AzuraCast.

**Bed** — The instrumental audio under an announcement
(`announcements.bedsDir`).

**Catalog** — The exported snapshot of songs, Bible books and videos used to
generate the public pages and their per-route SEO.

## Content and jobs

**Worker** — A Windows machine running the worker client, `yt-dlp` and `ffmpeg`.
It connects over WebSocket, receives jobs, and uploads finished files.

**Processing job** — A row in `ProcessingJob` that a worker executes: download,
transcode, upload. Distinct from a cron.

**Cron** — A `node-cron` task inside the backend, registered in
`jobs/scheduler.ts`.

**System job** — An entry in `systemJobs.registry.ts`, which makes a cron runnable
from the panel's Jobs page.

**Release** — A worker binary ZIP stored with its SHA-256. Workers apply it only
when idle.

**Ingest** — Turn one YouTube upload into one `YouTubeVideo` plus one
`ProcessingJob`. The unique `videoId` is the deduplication point.

**Notice (aviso in-app)** — An in-app overlay with a time window, an audience and
a display mode. Not a push notification.

**Push campaign** — A manual notification sent to a filtered audience of devices,
logged in `PushNotificationLog`.

## Panel and access

**Permission** — One of 21 keys in `packages/types/src/admin.ts`. The backend is
the authority; the frontend copy only hides UI.

**Panel secret** — `x-panel-secret`, the credential for `/panel-api/*`. Different
from the JWT on purpose.

**`tokenVersion`** — Integer on `AdminUser`. Bumping it invalidates every issued
JWT, which is how session revocation works.

**Effective permissions** — The result of applying the role to the stored
permission list. Recomputed on every request.

## Listeners

**`deviceId`** — A generated identifier that acts as a bearer capability. It
returns the petitions that device wrote, including the private answer.

**Unread answer** — A petition whose `respuesta` is non-empty and whose
`answerReadAt` is null. `unreadAnswerCount` is derived from exactly that.

**Read markers** — `readAt` belongs to the station team; `answerReadAt` belongs to
the listener. Never write one where the other is meant.

**Opinion (opinión)** — A listener message from `/opiniones` or the app: praise,
suggestion, question or problem report. Never published; there is no public
read endpoint.

**Zone** — An administrative region assigned to a device (manual or GeoIP) used to
segment notices and push campaigns without asking for location.

## Operations

**Watchdog** — The health module. Seven checks every two minutes, alert
de-duplication with backoff, one automatic remediation (AutoDJ restart, guarded
against interrupting a live streamer).

**Check** — One of `azuracast`, `autodj`, `workers`, `youtube_jobs`, `disk`,
`backup`, `listener_sampling`.

**Bundle** — A backup archive: WAL-safe SQLite snapshot plus worker releases and
notice media, uploaded to R2.

**Station day** — The calendar day in `config.locutor.timezone`, not UTC. Day keys
(`YYYY-MM-DD`) come from it, which is why announcements, playback windows and
program uploads all agree.

**Draft (program)** — A composed episode awaiting publish, discarded after
`PROGRAMS_DRAFT_TTL_HOURS`.

**Trust proxy hop** — The single nginx layer in front of the process. Hop count 1
is the contract.
