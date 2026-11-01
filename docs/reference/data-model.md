# Data model

39 models across 19 files in `backend/prisma/schema/`, on SQLite. `main.prisma`
holds the generator and datasource; every other file is combined by the Prisma
CLI (multi-file schema, GA since Prisma 6.7, no preview flag). Relations work
across files without imports.

Migrations live in `backend/prisma/schema/migrations/` (46 folders) because the
npm scripts pass `--schema prisma/schema`.

## Conventions that hold across the schema

- **Tables are `snake_case`** via `@@map`, columns via `@map`. The Prisma client
  keeps camelCase in TypeScript.
- **There are no enums.** SQLite has no enum type, so status-like columns are
  `String` with the accepted values in a comment. The narrow union lives in
  `packages/types/` and is reconciled in exactly one place per feature.
- **Ids are `uuid()`** except `WorkerRelease` (`cuid()`), `StationSetting`
  (key as id) and `AnnouncementStreamerCredential` (a `singleton` id).
- **Lists are JSON strings.** `permissions`, `slots`, `subscriptions`,
  `audienceDeviceIds` and similar columns store JSON text. There is no SQLite
  array type and no join table for these because nothing queries inside them.
- **Timestamps are `DateTime` with `@default(now())`** and `updatedAt` where the
  row is edited. The API serializes them as ISO-8601 strings.
- **Indexes exist for the query that actually runs.** Where an index looks odd
  (for example `PlaybackEvent.songId`), the comment in the file explains the
  measured reason.

## Admin and access — `admin.prisma`

| Model | Table | Key columns | Relations |
| --- | --- | --- | --- |
| `AdminUser` | `admin_users` | `email` unique, `role` (`SUPERADMIN`/`ADMIN`/`USER`), `permissions` JSON, `isActive`, `tokenVersion` | has many `DjAssignment` |
| `DjAssignment` | `dj_assignments` | `streamerUsername`, `slots` JSON (`[{dow,start,end}]` in station time), `isActive` | belongs to `AdminUser`, cascade delete |

`tokenVersion` is the revocation mechanism: bumping it invalidates every JWT
issued before, which is how "revoke sessions" works without a session table.

## Bible — `bible.prisma`

`BibleTranslation` → `BibleBook` → `BibleChapter` → `BibleVerse`.
Uniqueness: `[translationId, name]`, `[bookId, number]`, `[chapterId, number]`.
`BibleBook.order` (1..66) is what makes canonical ordering possible; the reading
rotations depend on it.

## Announcements — `announcements.prisma` and `announcement-playback.prisma`

| Model | Table | Purpose |
| --- | --- | --- |
| `AnnouncementTemplate` | `announcement_templates` | Text template, voice label, speed, active |
| `GeneratedAudio` | `generated_audios` | The audio bank: rendered text, duration, `provider`, `hourValue`, `timeSlotGroup`, `lastUsedDate` |
| `AudioSchedule` | `audio_schedules` | Legacy per-hour scheduling rows, unique per date+hour |
| `GenerationLog` | `generation_logs` | One row per generation run |
| `AnnouncementSlot` | `announcement_slots` | Persisted plan: `minuteOfDay`, `plannedFor`, `status`, `reason`, `retryCount` |
| `AnnouncementRunLog` | `announcement_run_logs` | One row per attempt, including blocked ones |
| `AnnouncementStreamerCredential` | `announcement_streamer_credentials` | Encrypted streamer password, singleton row |

`GeneratedAudio.provider` is load-bearing: `findReusableAudio` filters on the
provider that would answer right now, so a Kokoro recording is not reused after
ElevenLabs becomes available.

`AnnouncementSlot.status` is `pending | deferred | played | skipped | failed`.
`AnnouncementRunLog.outcome` is `attempted | blocked_live | blocked_program |
played | failed | expired`. Both unions live in `packages/types/src/admin.ts`.

## Bumpers — `bumpers.prisma`

`PlaylistBumper` (`playlist_bumpers`): `playlistId` unique, `introMediaId`,
`outroMediaId`, local `introFile`/`outroFile` copies, `glued`, `enabled`,
`lastSyncedAt`, and the snapshot columns `priorBackendOptions` / `priorOrder`
used to restore the playlist when the bumper is disabled or deleted.

`priorBackendOptions === null` means "no snapshot taken". An empty string means
"the playlist had no options". Collapsing those two loses the ability to restore.

## Devices and push — `devices.prisma`

| Model | Table | Notes |
| --- | --- | --- |
| `Device` | `devices` | `deviceId` unique (the bearer capability), `fcmToken`, `platform`, `appVersion`, `subscriptions` JSON, `localRemindersEnabled` nullable, zone fields, `lastIp` |
| `PushNotificationLog` | `push_notification_logs` | Audience kind, JSON filters, sent/failed counts |
| `ProgramNotification` | `program_notifications` | Unique per `[programId, startTimestamp]`, prevents duplicate reminders |

`localRemindersEnabled` is tri-state: `true` means the app schedules reminders
locally so the server push is skipped, `null` means an app version that predates
the field.

## Feedback — `feedback.prisma`

`FeedbackMessage` (`feedback_messages`): `categoria`, `mensaje`, optional
`nombre`/`contacto`, `estado` (`PENDIENTE | RESUELTO | DESCARTADO`), `readAt`.
There is deliberately no `publishedAt` and no public read endpoint.

## Listeners — `listeners.prisma`

`ListenerSnapshot` (`listener_snapshots`): `current`, `unique`, `total`,
`recordedAt`. One row every five minutes, feeding the dashboard chart.

## Notices — `notices.prisma`

| Model | Table | Notes |
| --- | --- | --- |
| `AppNotice` | `app_notices` | Window (`startsAt`/`endsAt`), audience, `displayMode`, `maxDisplaysPerUser`, `dismissible` |
| `NoticeImage` | `notice_images` | Optimized WebP, served from `/media/notices` |
| `NoticeVideo` | `notice_videos` | 720p H.264 plus a poster frame |
| `NoticeGalleryItem` | `notice_gallery_items` | Ordered carousel items, cascade delete |

`AppNotice.imageUrl` and `videoUrl` are marked deprecated in the schema in favour
of `galleryItems`. They stay for data written before the carousel existed.

## Notification programs — `notifications.prisma`

`NotificationProgram` (`notification_programs`): `titleKey` unique (normalized
title), `title`, `notifiable`, `isDefault`. The normalized key is what the app
and the reminder job match on, so a rename with different casing does not fork
rows.

## Playback history — `playback.prisma`

`PlaybackEvent` (`playback_events`): `azuracastShId` unique (idempotency),
`playedAt`, `durationSec`, and the copied metadata `songId`, `title`, `artist`,
`album`, `playlist`, `streamer`, `isRequest`.

The metadata is copied on purpose: resolving it against the station library
means paginating thousands of files, and the history is read far more often than
the library.

## Prayer and feedback neighbours — `prayers.prisma`

`PrayerRequest` (`prayer_requests`): `deviceId` (nullable FK to `Device`), `name`,
`request`, `estado`, `respuesta`, `answeredAt`, `readAt`, `answerReadAt`.

`readAt` is the station team's unread marker; `answerReadAt` belongs to the
listener. They must not be folded back together: the mobile detail screen used
to write `readAt`, which cleared the admin inbox badge for everyone.

## Programs — `programs.prisma`

| Model | Table | Notes |
| --- | --- | --- |
| `Program` | `programs` | `name` and `slug` unique, metadata defaults, `playlistId`, folder layout, schedule mode, day mask and window |
| `ProgramEpisode` | `program_episodes` | `status`, `uploadDate` (station day string), `durationSec`, `relativePath`, `mediaId`, the two repair flags |

`ProgramEpisode.status` is `draft | processing | queued | played | failed`.
`draft` is the composed preview that has not been published yet.

## Rotations — `rotations.prisma`

| Model | Table | Notes |
| --- | --- | --- |
| `PlaylistRotation` | `playlist_rotations` | Source (`playlist` or `folder`), target playlist, `itemsPerDay`, `cursor`, `loop`, `active`, `bibleMode`, `translation` |
| `RotationRunLog` | `rotation_run_logs` | `runDate`, `status`, `itemsPicked`, `itemsPlaced`, JSON `details` |

`cursor` is the only mutable position, and the announced chapter is read off the
audio at `source[cursor]`, so the reading cannot drift from what is played.
`bibleStartOrdinal` still exists but is no longer read or written by the API.

## Schedule — `schedule.prisma`

`ScheduleCategory` (`schedule_categories`): `name` unique, `color`, `icon`,
`keywords` (comma-separated title matches), `isVisible`, `sortOrder`.

The category is not a column on a program: the playlist name is the schedule
item title, so `categorizer.service.ts` tags it from these keywords.

## Settings — `settings.prisma`

| Model | Table | Notes |
| --- | --- | --- |
| `StationSetting` | `station_settings` | `key` as primary key, `value` as text, `updatedBy` |
| `ProviderApiKey` | `provider_api_keys` | `ciphertext`, `iv`, `tag` (AES-256-GCM), `label`, `enabled` |
| `StationSettingChange` | `station_setting_changes` | `key`, previous and new value, `changedBy` |

`StationSetting.value` is text even for numbers and booleans: the catalog
declares the type and parses on read. That is why adding a setting is a catalog
entry, not a migration.

`ProviderApiKey` lives in its own table because `station_settings` is included in
full in every backup and served from the panel. The encrypted columns never hold
plaintext, and the panel only reads the last four characters.

## Workers and YouTube — `workers.prisma`, `youtube.prisma`

| Model | Table | Notes |
| --- | --- | --- |
| `WorkerNode` | `WorkerNode` | `workerId` unique, `status`, `currentJobId`, `version`, `lastSeenAt` |
| `WorkerRelease` | `WorkerRelease` | `version` unique, `sha256`, `size`, `filePath`, `mandatory` |
| `ProcessingJob` | `ProcessingJob` | `videoId`, `workerId`, `status`, `attempts`, `deadlineAt`, `nextRetryAt` |
| `YouTubeVideo` | `YouTubeVideo` | `videoId` unique, `channelId`, `status`, `localPath`, `azuracastFileId` |
| `YouTubeChannel` | `YouTubeChannel` | `channelId` unique, `category`, lease dates, `subscriptionError`, `feedEntryCount` |

`WorkerNode`, `WorkerRelease` and `ProcessingJob` use their model name as the
table name (no `@@map`). It is inconsistent with the rest of the schema and
harmless; do not "fix" it without checking the backup and restore scripts.

`YouTubeChannel` is the configuration, not a mirror of the environment.
`feedEntryCount` is the self-diagnosis: `null` means never checked, `0` means the
feed answered with no videos.

## Changing the schema

See `how-to/change-the-database.md`. Two rules that matter more than the rest:

- `prisma migrate dev` may reset the database when it detects drift. Production
  uses `prisma migrate deploy` only.
- If a column changes meaning for existing rows, the migration must backfill.
  `20261012000000_add_prayer_answer_read_at` is the reference example: leaving
  existing answered petitions as `NULL` would have shown an unread badge for
  every one of them the day the app shipped.
