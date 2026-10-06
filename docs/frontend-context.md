# Frontend Context

## Stack

- React
- Tailwind CSS
- TypeScript-first

## Frontend conventions

- Keep components small and focused.
- Prefer composition over large monolithic components.
- Use Tailwind for styling instead of custom CSS unless there is a real reason.
- Keep props minimal and descriptive.
- Prefer local state when practical.
- Avoid duplicated state and unnecessary re-renders.
- Model loading, empty, error, and success states explicitly.
- Keep accessibility in mind.
- Preserve the project's existing UI patterns and spacing conventions.

## Backend wiring (env vars)

`apps/web/src/config.ts` is the single place that builds every backend URL
(`apiUrl()`, `API_BASE_URL`). Two independent variables define the topology,
and mixing them is the source of most "it works in production but not in dev"
bugs.

`VITE_API_BASE_URL` is what the **browser** calls. It must be empty or an
absolute `http(s)` URL, and `config.ts` throws at startup otherwise. Empty
means same-origin, which is the setup in production (nginx serves the app and
proxies `/api`, `/admin-api`, `/live-status` and `/live-relay`). A bare host
such as `www.lavozverdad.com` is rejected on purpose: it used to be silently
treated as a relative path and resolved against the current route, producing
requests like `localhost:5173/admin/www.lavozverdad.com/api/nowplaying`.

`VITE_API_PROXY_TARGET` is what the **Vite dev server** forwards to. It only
exists in `vite.config.ts` and never reaches the bundle. To run the frontend
locally against the production backend, set `VITE_API_BASE_URL=` (empty) and
`VITE_API_PROXY_TARGET=https://www.lavozverdad.com`. This is preferred over
pointing `VITE_API_BASE_URL` at production: requests stay same-origin, so CORS
does not apply, cookies are not third-party, and SSE plus the `live-relay`
WebSocket keep working. The dev server prints the resolved target on boot
(`[vite] API dev proxy -> ...`), and an unusable value fails the boot instead
of degrading into 404s. If a cross-origin setup is ever needed, add the dev
origin to `ALLOWED_ORIGINS` in `backend/src/app.ts` (`http://localhost:5173`
and `http://localhost:4173` are already there).

## Suggested expectations for the agent

- Identify the exact components, hooks, and styles involved.
- Describe state flow clearly.
- If a UI change affects behavior, mention edge cases and empty states.
- If a component is becoming too large, suggest a clean split.

## Admin design system (as of Aug 2026)

- The admin panel has its own scoped theme via the `.admin-theme` class
  (`apps/web/src/index.css`): "studio night" surfaces, signal-amber primary,
  and a tally red (`--tally`) reserved exclusively for live/on-air states.
  The public site keeps its own `:root` tokens; do not mix them.
- Semantic tokens mapped in `tailwind.config.js`: `sunken`, `faint`,
  `success`, `warning`, `info`, `tally`, plus shadcn defaults. Use these
  instead of literal slate utilities in admin pages (migration is partial:
  Dashboard, Login, and Layout are done).
- Fonts: IBM Plex Sans Variable (UI) + IBM Plex Mono (timecodes, IPs, IDs,
  section eyebrows). Loaded via @fontsource in `main.tsx`.
- Tailwind token colors require `/ <alpha-value>` in their mapping for
  opacity modifiers (`bg-primary/10`) to generate CSS. Do not remove it.
- The global 44px touch-target rule is reset inside `.admin-theme`; admin
  buttons size via component utilities.
- Shared admin pieces: `StationStatusProvider`/`useStationStatus` (single
  now-playing poll, 20s), `components/admin/OnAirStrip` (tally light +
  progress hairline, mounted in the topbar).
- Health watchdog UI: `pages/admin/AdminHealth.tsx` (checks grid, open
  alerts, automatic actions; polls 30s while status != ok) wired through
  `useAdminApi.getHealthOverview/runHealthCycle` and `@radio/types
  Health*`. Public degraded banner: `components/layout/
  StationHealthBanner.tsx` polls `/api/health/public` (60s) and renders
  only when status is degraded/critical; when the stream is down it mounts
  `components/layout/StreamDownHelp.tsx`, which shows the next programs
  (`@radio/api` `fetchSchedule` + `mergeConsecutiveScheduleItems`) and the
  Bible reading of the day (`/api/bible/reading/today`).
- Bible reading: `pages/admin/AdminRotations.tsx` manages the rotations, and
  its `AlignRotationDialog` is how a reading that was advanced by hand gets
  handed back to the automation. It loads `GET /admin-api/rotations/:id/source`
  (real position, next chapters, files whose chapter could not be resolved) and
  posts `{ book, chapter }` to `/align`, which moves the cursor and runs the
  rotation immediately. The book/chapter pickers are built from the chapters
  the source actually contains, not from a hardcoded list.
  `pages/admin/AdminReadingHistory.tsx` shows the per-day history.
- Programs: `pages/admin/AdminPrograms.tsx` (grid of programs, each with its
  pending/played counters) plus a `pages/admin/programs/` folder holding
  `ProgramFormDialog.tsx` (metadata, default artwork, intro/outro, schedule
  mode, day mask, emission window), `EpisodeUploadDialog.tsx` (audio + optional
  per-episode image + the slot the backend reserved + the per-episode audio
  repair checkboxes) and
  `ProgramEpisodesDialog.tsx` (status list with "marcar emitido" and "volver a
  la cola"). `programs/shared.ts` holds the day names, the status label/class
  maps and `errorMessage`. Route `/admin/programs`, permission `programs`,
  sidebar item in Contenido between Playlists and Rotaciones.
  The episode dialog polls every 4 s while any episode is `processing`, because
  publishing a long episode is a long upload. A draft can be previewed and
  published again from the episode list if the admin left the upload dialog.
- Sidebar nav is grouped into Emisión / Contenido / Audiencia sections;
  the topbar derives the page title from that same structure.
- Data loaders use `.then` chains on purpose: react-hooks v7 flags
  setState reachable from functions invoked inside effects.
- Pending design debt: migrate remaining pages off literal slate classes,
  unify duplicated DetailRow/status-badge maps/skeletons, single
  SegmentedControl and Checkbox, keyboard access for the upload dropzone,
  replace the native confirm() in AdminScheduleCategories.
