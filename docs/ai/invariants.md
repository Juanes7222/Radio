# Invariants

Rules that must hold no matter what you are changing. Each one exists because
breaking it already caused a failure. They are stated imperatively so they can be
checked, not admired.

## Process and configuration

1. `PORT` and `WS_PORT` must differ. Both default to `3001`.
2. Config modules read required env at import time. Import `config` only after
   secrets are loaded; `index.ts` does this with dynamic imports.
3. `app.set("trust proxy", 1)` requires nginx to send
   `X-Forwarded-For $proxy_add_x_forwarded_for`. Do not change the hop count
   without changing nginx.
4. A station setting that an operator may want to change lives in
   `settings.catalog.ts`, not in an env var. A value read once at registration
   (like the health interval) must be marked `requiresRestart`.

## Security

5. Privileged credentials never leave the backend. No API key, streamer password
   or webhook secret is serialized into a response.
6. `requireAuth` reloads the user from the database on every request. Never trust
   role or permissions from the token.
7. A `USER` role gets exactly its stored permissions. `ADMIN` gets everything
   except `users`. `SUPERADMIN` gets everything.
8. Public routes must not return admin-only fields. If a response serves both,
   shape it per audience instead of reusing the query.
9. A wrong `deviceId` gets `404`, never `403`. A missing `deviceId` fails closed.
10. Never log a full `deviceId`, a streamer password, or a webhook secret.

## Routing and mounts

11. The YouTube webhook router mounts before the YouTube admin router.
12. `/admin-api/settings/voice-keys` mounts before `/admin-api/settings`.
13. Literal segments (`episodes`) mount before parameterised ones (`:id`).
14. A path the panel polls on a timer belongs in `SILENT_LOG_PATHS`.

## Database

15. Production runs `prisma migrate deploy` only. Never `migrate dev`, never
    `reset`.
16. Prisma commands always pass `--schema prisma/schema`.
17. A column that changes what existing users see must be backfilled by the
    migration.
18. A new table uses `@@map("snake_case")`; columns use `@map`. The three worker
    models are the only exception and are left alone.
19. Status-like columns are `String` with accepted values in a comment and a
    single reconciling function in the feature. Do not spread the cast.

## Audio

20. A sequential playlist drops items once played. Archive detection depends on
    that; do not switch a program playlist to another order.
21. `merge` and `single_track` are written together, and only when `glued` is
    true. News stays `glued: false`.
22. Never apply ffmpeg `loudnorm`. Measure with `ebur128`, apply `volume`.
23. An announcement never cuts a live human. Check live state first, and
    `isAnnouncementInFlight()` before spending the harbor.
24. Reuse of announcement audio filters by `provider`.
25. A stalled own live source is released by the watchdog after
    `announcements.stuckLiveMinutes`, never by cutting a person.

## Content

26. Rotations empty and rebuild the target playlist each run. Anything pinned to
    it must reconcile afterwards.
27. The rotation announcement comes from the audio at `cursor`. Do not derive the
    chapter from a stored ordinal.
28. Bumper `priorBackendOptions === null` means no snapshot; `""` means no
    options. Both are restorable states.
29. A program episode is composed once and published from the composed file. Do
    not re-run ffmpeg on publish.
30. YouTube ingestion polls `playlistItems.list`. The Atom feed does not deliver
    entries; do not reintroduce push as the transport.

## Frontend

31. `.admin-theme` redeclares every public token. A new public token needs its
    admin counterpart or it leaks indigo into the amber panel.
32. Token colors in `tailwind.config.js` keep `/ <alpha-value>`.
33. `tally` is on-air state only. Use `destructive` for errors.
34. The route transition is entrance-only. No `exit`, no `AnimatePresence` around
    `<Outlet />`.
35. `PublicLayout` owns header, mini player and prayer dialog. A page does not
    render `<Header />`.
36. Resolve artwork through `resolveArtworkUrl()`, never `song.art`.
37. `VITE_API_BASE_URL` is empty or an absolute `http(s)` URL. Bare hosts throw.
38. Media URLs reach the browser same-origin; only `/api/station/` is rewritten,
    because mounts and `listen_url` address ICEcast.
39. The mobile `deviceId` is a capability, and the badge count comes from one
    provider (`usePrayerAnswers`), not from per-screen state.

## Documentation and tests

40. Do not weaken a design guardrail to make a change pass. If the rule no longer
    applies, the change includes the rule and its reason.
41. A comment that records a measurement is data, not noise. Keep it.
42. If prose and code disagree, the code wins and the prose gets fixed.
