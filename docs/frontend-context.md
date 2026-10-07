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

## Opinions (Oct 2026)

`/opiniones` is the third public submission surface, next to song requests and
prayer requests. `pages/OpinionesPage.tsx` is a public route with its own
`Header` and `AppFooter`, mounted under `PublicLayout` like the other public
pages (the layout supplies only the health banner, the transition and the
MiniPlayer).

- **The form is a sheet of stationery, not a form.** One tall
  `rounded-2xl border border-border bg-card` with no shadow, divided by
  `border-border` hairlines. Inputs are borderless (`bg-transparent`) so the
  ruled line is the only affordance; the hairline turns `text-destructive`
  colour via `aria-invalid` when a field is wrong, and the error sentence sits
  under it with `aria-live="polite"`. The letterhead row above the rules is the
  one place `mono-meta` carries identity rather than data.
- The motive is a **single-select line** of text options separated by `·`, not a
  chip bank. `MotiveField` hides the radio inputs with `sr-only` and keeps the
  focus ring on the visible label.
- **`--tally` appears exactly once on this page**, in
  `components/feedback/OnAirStamp.tsx`. The system reserves it for live state
  and this is the only live moment: after a successful POST the form is replaced
  by a vector seal (two concentric squares + lamp + `AL AIRE`) that draws itself
  with `pathLength`. Do not reach for tally on any other part of a public page.
- No eyebrow above the `h1`, no gradient text, no card shadows: the heading
  carries its own weight. Copy is sober tuteo with no regionalisms.
- Client-side validation mirrors `validateFeedbackSubmission` in the backend
  (`packages/types/src/feedback.ts` exports `FEEDBACK_LIMITS` and
  `FEEDBACK_MIN_MENSAJE` so both sides read the same numbers). On failure the
  first offending field takes focus; on success the confirmation heading is
  focused via a `tabIndex={-1}` ref.
- Admin moderation is `pages/admin/AdminFeedback.tsx` (list + estado/categoria
  filters + search + status `Select` + delete). It polls every 60 s instead of
  using SSE: unlike prayer there is no stream service or one-shot ticket, and
  the inbox volume does not justify them.
- Mobile mirrors it at `apps/mobile/app/feedback.tsx`, reached from a card in
  the **Redes** tab rather than a sixth tab. Same content, mobile tokens
  (Fraunces display instead of Instrument Serif). The stamp is rebuilt from
  plain views because RN needs no SVG asset.
- `apps/web/PRODUCT.md` records the product truth and
  `apps/web/.impeccable/surfaces/` the surface direction contract.

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
  `ProgramFormDialog.tsx` (playlist de AzuraCast, metadata, default artwork,
  intro/outro, schedule mode, day mask, emission window),
  `EpisodeUploadDialog.tsx` (audio + optional
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

## SEO metadata (as of Sep 2026)

The public site is a client-rendered SPA served by a single
`dist/index.html`, so before this change all seven public URLs shared one
title and one description. Search metadata is now generated per route.

- `apps/web/src/config/seo.config.ts` is the single source of truth:
  `SITE_URL` (canonical `https://lavozverdad.com`), `PUBLIC_ROUTES`,
  `ROUTE_META`, and the `buildHeadTags` / `buildSocialTags` / `buildJsonLd` /
  `buildSitemapXml` generators. Keep it free of browser globals — it is loaded
  at build time.
- `index.html` marks three regions with `<!--seo:head-->`,
  `<!--seo:social-->` and `<!--seo:jsonld-->` comment pairs. The build
  replaces each region (markers included) per route; the static values in
  `index.html` are only the `vite dev` / non-public-route fallback.
- `vite.config.ts` owns two plugins: `perRouteSeo` (`apply: 'build'`) writes
  `dist/<route>/index.html` for every public route plus `dist/sitemap.xml` in
  `writeBundle`; `devRouteSeo` (`apply: 'serve'`) does the same substitution
  through `transformIndexHtml`. In dev the requested route is only in
  `ctx.originalUrl` — Vite normalises `ctx.path` to `/index.html`.
- nginx needs no change to serve the per-route files: `try_files $uri $uri/`
  plus `index index.html` already resolves `/programacion` to
  `dist/programacion/index.html`. HTML is absent from
  `snippets/static-cache.conf`, so heads are not pinned by a long cache.
- `components/layout/useRouteMeta.ts` re-applies the same tags on SPA
  navigation so a link shared after in-app navigation is not mislabelled.
- Canonical host: `www.lavozverdad.com` and the whole `vozyverdad.com` pair
  301 to `https://lavozverdad.com` in `scripts/nginx/domains/`. Note that
  `backend/.env.example` still uses `https://www.lavozverdad.com` for
  `PUBLIC_URL`; that value feeds the YouTube webhook callback and the worker
  upload URL, so changing it requires re-registering the callback.
- Body markup is deliberately NOT prerendered. `LegalDocPage` and
  `PageTransition` set framer-motion `initial={{ opacity: 0 }}`, so
  `renderToString` would emit invisible content, and hydrating it would mean
  reproducing the whole provider stack from `main.tsx` in Node. Per-route head
  tags deliver the search value without either risk.
- `/` and `/programacion` still ship an empty `<div id="root">`: their content
  comes from the API at runtime. Prerendering them would couple the deploy to
  the backend and freeze the schedule until the next release.
- `tests/perf/static-assets.test.ts` covers the SEO invariants, including the
  `og:image` reference that previously pointed at a nonexistent
  `/icon-512x512.png`. `public/og-image.png` (1200x630) has its own byte
  ceiling instead of the icon-set one.

