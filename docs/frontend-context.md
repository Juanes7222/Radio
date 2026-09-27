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

