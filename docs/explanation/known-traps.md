# Known traps

Failures that already happened in this repository, or that cost hours when
someone walks into them. Each one is a real incident, not a hypothetical. If you
are an agent reading only one file before editing, read this one.

## 1. `PORT` and `WS_PORT` default to the same number

`PORT` and `WS_PORT` both default to `3001`. The HTTP server starts, then the
worker WebSocket server fails with `EADDRINUSE` and the process keeps running with
half its functionality gone.

**Rule:** set both explicitly. The examples use `3000` and `3001`.

## 2. `trust proxy` needs exactly one nginx hop

`app.set("trust proxy", 1)` in `app.ts` assumes nginx appends the real peer to
`X-Forwarded-For`. Without
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, every request has
`req.ip === 127.0.0.1`, and the login limiter (30 attempts / 10 min) becomes one
global counter that locks out every admin at once.

**Rule:** hop count 1 plus the nginx header. A client-supplied header cannot spoof
it, because nginx appends the real peer as the last entry and Express reads that
one.

## 3. The YouTube webhook must be mounted before the admin router

The admin router applies `requireAuth` to every path below it. Mounted first, the
hub gets `401` instead of the challenge, the subscription never verifies, and the
only trace is a `202` that the hub returns before checking anything.

**Rule:** `youtubeRouter` (webhook) before `youtubeAdminRouter` in `app.ts`.
`apps/web/tests/youtube/websub-wiring.test.ts` fixes the order.

## 4. AzuraCast reports `display_name`, not the login

The announcement streamer account is `avsisos_auto` with
`display_name = STATION_NAME`. Comparing only against the login made the station's
own announcement read as a human, so `verifyLiveSwitchBack()` took the branch that
never disconnects and the harbor stayed occupied. On 30 October 2026 the station
had been silent for over a day with the account still connected.

**Rule:** recognize the account by login **and** display name
(`getAnnouncementStreamerIdentities()`), and free the harbor before synthesizing.

## 5. `loudnorm` eats the first three seconds

In ffmpeg 8 both the dynamic and linear two-pass modes of `loudnorm` discard about
3 seconds (measured: 12.0 s in, 9.10 s out). Every normalized episode lost its
intro silently.

**Rule:** measure with `ebur128`, apply a static `volume` gain. `afftdn`,
`volume` and `afade` were verified to preserve duration.

## 6. `merge` breaks news cleanup

A playlist with `merge` plays as one track, so the history records one entry and
the individual file `song_id`s never appear. `cleanupNewsFolder` stops recognizing
them as aired and the news folder grows without limit.

**Rule:** news stays `glued: false`. Bumpers for news are rejected or warned.

## 7. `AnimatePresence mode="wait"` around `<Outlet />` mounts the page twice

The exiting child already resolves `<Outlet />` to the incoming route, so the
incoming page mounts hidden inside the outgoing wrapper and again for real when
the exit finishes. Returning to `/` mounted the whole console twice and blocked
the main thread twice.

**Rule:** the route transition is entrance-only. No `exit`, no
`AnimatePresence` there.

## 8. A global `Header` per page loses the prayer dialog

Each page used to mount its own `Header`, and `onOpenPrayer` was optional, so
"Pedir oración" only existed on `/`, and the dialog lived inside `App.tsx` and
unmounted on navigation.

**Rule:** `PublicLayout` owns the chrome. `Header`'s callback prop is required, so a
page-level `<Header />` fails to compile. `tests/routing/media-urls.test.ts` also
fails if one reappears.

## 9. A canonical URL with the wrong trailing slash is not indexed

nginx resolves `/programacion` to `dist/programacion/` and 301s the bare path, so
only the trailing-slash form answers `200`. While the canonical named the
redirecting form, `/programacion` and `/opiniones` were not indexed at all.

**Rule:** `canonicalUrl()` in `seo.config.ts` is the only place that decides, and
the sitemap reads the same function. Every canonical carries a trailing slash.

## 10. `VITE_API_BASE_URL` as a bare host silently breaks every request

A value like `www.lavozverdad.com` used to be treated as a relative path and
resolved against the current route, producing requests to
`localhost:5173/admin/www.lavozverdad.com/api/nowplaying`.

**Rule:** `apps/web/src/config.ts` throws at startup unless the value is empty or
an absolute `http(s)` URL with no query or fragment.

## 11. Panels that poll their own log

`/admin-api/logs`, `/health`, `/admin-api/health`, `/api/health/public`,
`/admin-api/feedback` and `/admin-api/playback` are in `SILENT_LOG_PATHS`. Without
that, every poll writes a morgan line into the PM2 file the panel's log viewer
reads, and the log becomes a recording of itself.

**Rule:** a new endpoint that the panel polls on a timer belongs in that list.

## 12. `priorBackendOptions === null` and `""` are different

For bumpers, `null` means "no snapshot was taken" and `""` means "the playlist had
no backend options". Collapsing them loses the ability to restore the playlist
when the bumper is removed.

**Rule:** check both cases explicitly when restoring.

## 13. `readAt` and `answerReadAt` are two audiences

`readAt` is the station team's unread marker. `answerReadAt` belongs to the
listener. The mobile detail screen used to write `readAt`, so opening a petition
on a phone cleared the admin inbox badge for the whole team.

**Rule:** only the panel writes `readAt`; only `POST /api/prayer/:id/answer-read`
writes `answerReadAt`, and it takes a `deviceId`. Do not fold the two columns back
together.

## 14. Rotations empty the target playlist every night

`rotation.service.ts` clears and rebuilds the target playlist at 03:30. Anything
pinned to it disappears on the next run.

**Rule:** anything pinned must reconcile on its own cron, after the rotation.
Bumpers do exactly that.

## 15. `prisma migrate dev` can reset a production database

`migrate dev` may reset when it detects drift. `migrate deploy` only applies
pending migrations.

**Rule:** production uses `prisma:migrate:deploy` exclusively. Never `dev`, never
`reset`. The schema flag `--schema prisma/schema` is part of every npm script for
the same reason: a bare CLI call looks for `prisma/schema.prisma` and fails.

## 16. A migration that adds a read marker must backfill

`20261012000000_add_prayer_answer_read_at` exists because leaving existing answered
petitions as `NULL` would have handed every device a full inbox of unread badges
the day the app shipped.

**Rule:** when a new column changes what users see for existing rows, the
migration backfills.

## 17. The rotation source resolution is slow, and the admin timeout is 10 s

Resolving a source walks the whole station library. It used to exceed the admin
request timeout. `listAllStationFiles` now reads the total from page 1 and fetches
the rest concurrently, and the source is cached for 10 minutes with in-flight
de-duplication.

**Rule:** `/rotations/:id/source` and `/align` get a 120 s frontend timeout. If you
add a similarly heavy endpoint, invalidate caches on uploads and deletes as
`bumpers`/`rotation` do.

## 18. Cache the announcement by provider, or the voice never changes

A Kokoro recording in the bank would keep being reused after ElevenLabs became
available, and the station would sound robotic for weeks with nothing pointing at
the cause.

**Rule:** `findReusableAudio` filters on `provider`. Old rows are not deleted, they
just stop being reused and age out.

## 19. Announcements are budgeted per emission, not per attempt

Counting attempts made a day of live programs silently consume the allowance.

**Rule:** `perDay` is compared against `played` slots for the station day. A
blocked or failed slot spends nothing, and replanning keeps pending slots instead
of redrawing everything.

## 20. `PORT`/`WS_PORT` aside, two listeners share one origin behind nginx

Audio and SSE are both held by a single browser tab. A combined connection budget
made a normal listener exhaust it and receive `503` while the audio kept playing.

**Rule:** `stream_conn` (60) and `sse_conn` (40) are separate zones. Do not merge
them.

## 21. Artwork is off, and reading `song.art` bypasses that

`ARTWORK_ENABLED` is `false` because AzuraCast serves a full-resolution JPEG per
track. Any consumer that reads `song.art` directly ignores the switch.

**Rule:** resolve through `resolveArtworkUrl()`. `tests/artwork/artwork-switch.test.ts`
checks both halves.

## 22. The harbor is a single slot

Two announcements cannot overlap, the harbor is one connection, and a human DJ
holds the same resource. `isAnnouncementInFlight()` is not paranoia; without it two
slots raced for the mount.

**Rule:** check `isAnnouncementInFlight()`, evaluate live state, and never cut a
human. `POST /admin-api/locutor/live/release` is the manual escape hatch.

## Quick reference

| Symptom | Likely trap |
| --- | --- |
| `EADDRINUSE` at boot | 1 |
| Every admin locked out of login | 2 |
| YouTube subscription never verifies, hub got `202` | 3 |
| Harbor occupied by `avsisos_auto`, radio silent | 4, 22 |
| Episode missing its first seconds | 5 |
| `NOTICIAS` folder grows forever | 6 |
| Page mounts twice on navigation | 7 |
| "Pedir oración" missing outside `/` | 8 |
| Pages not indexed, mixed slash canonical | 9 |
| Requests to `localhost:5173/<host>/api/...` | 10 |
| PM2 log full of polling lines | 11 |
| Bumper removal does not restore the playlist | 12 |
| Admin inbox badge clears by itself | 13 |
| Pinned intro disappeared overnight | 14 |
| Database emptied by a migration command | 15 |
| Badge on every old answered prayer | 16 |
| Panel request hanging on rotations | 17 |
| Announcements still robotic after switching engine | 18 |
| Announcements stopped early in the day | 19 |
| Listener gets `503` while audio plays | 20 |
| No covers anywhere | 21 |
