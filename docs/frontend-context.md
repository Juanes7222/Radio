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

## Public layout owns the chrome (Oct 2026)

Every public route is an element of `<Route element={<PublicLayout />}>`, so
`PublicLayout` is the only component that survives a navigation. It owns the
persistent chrome: `StationHealthBanner`, `Header`, the `MiniPlayer` and the
`PrayerRequestDialog`.

- **`Header` must not be rendered by a page.** Each page used to mount its own,
  and `onOpenPrayer` was optional, so "Pedir oración" — which is gated on that
  callback in both the desktop nav and the mobile drawer — only existed on `/`,
  and the dialog itself lived inside `App.tsx` so it unmounted on navigation.
  The prop is required now, so a page-level `<Header />` fails to compile, and
  `tests/routing/media-urls.test.ts` fails if one reappears.
  `stationName` comes from `useGlobalAudio().data?.station?.name`, so the header
  shows the live name instead of a hardcoded literal.
- **`AppFooter` is still mounted per page.** Not unified in this change: the
  inconsistency (`/programacion` and `/opiniones` have it, `/info/*` does not)
  predates it and is a separate call.
- **The route transition is entrance-only.** `AnimatePresence mode="wait"`
  around `<Outlet />` cannot work as written: `mode="wait"` holds the exiting
  child while the `<Outlet />` inside it already resolves to the incoming route,
  so the incoming page mounts once inside the outgoing wrapper (hidden, with the
  exit clip-path on top) and again for real when the exit ends. Returning to `/`
  mounted the whole console twice and blocked the main thread twice, which is
  what it felt like. `PageTransition` now animates only `initial`/`animate`. Do
  not reintroduce an `exit` here without a different mechanism.
- **The `Suspense` boundary sits around the `<Outlet />`, not around
  `<Routes>`.** Route chunks are lazy, so a boundary above `Routes` replaced the
  entire tree with a full-screen spinner, header and player included, and
  rebuilt it when the chunk landed. `main.tsx` keeps its outer boundary for the
  admin routes.
- `syncDockState` returns the previous state object when neither the route nor
  the dock flag moved. A fresh object with equal values is still a new value for
  React, which is what made every scroll tick re-render the public tree.

## AzuraCast media URLs (Oct 2026)

Artwork reaches the browser as an absolute URL built from whatever origin the
deployment used. The site CSP is `img-src 'self' data: https: blob:`, so an
`http://` one — or any origin other than the page's — is blocked, and on HTTPS it
is rejected as mixed content first.

`toSameOriginMediaUrls` in `packages/api/src/api.ts` reduces any absolute URL
whose path starts with `/api/station/` to the page origin. It runs after
`rewriteLocalhostUrls` (which only knows loopback) in `fetchNowPlaying`,
`fetchRequestableSongs`, `fetchSchedule` and the SSE/WebSocket handlers.

The scope is deliberate: `station.mounts[].url` and `listen_url` are absolute
too and address the ICEcast server, so reducing them would break playback. Only
`/api/station/` is the media namespace the backend proxies.

With the URL normalized the remaining failure is a plain 404: the station art
route does not have most covers. `GET /api/station/:stationId/art/:artId` tries
three candidate ids (`public.routes.ts`) and AzuraCast rejects all of them, so
every song change spent several failed image requests.

## Artwork is switched off (Oct 2026)

`src/lib/artwork.ts` is the single decision point. `ARTWORK_ENABLED` is `false`
and `resolveArtworkUrl` returns `null`, which is not a new state: the console,
the mini player and the request dialog already fall back to `VinylDisc` or a
plain icon when there is no cover. The reason is size and format — AzuraCast
serves a full-resolution JPEG per track over a listener's mobile connection.

Consumers must resolve through `resolveArtworkUrl` instead of reading `song.art`
directly, otherwise the switch does not reach them. The shipped surfaces are
`StationConsole`, `MiniPlayer`, `SongRequest`, `AdminDashboard` and
`AdminRequests`; `tests/artwork/artwork-switch.test.ts` enforces both halves.

Not covered, deliberately:

- `RadioPlayer`, `MobilePlayerHero`, `SongInfo` and `SongHistory` are
  `@deprecated Use StationConsole` with no importer, so they are tree-shaken out
  of the bundle. They still read `song.art` directly; route them through the
  resolver before un-deprecating any of them.
- `AdminUpload` shows the cover of the file the admin just uploaded. It is a
  verification affordance rather than a broadcast decoration, so it keeps
  working.

## Intro y outro de programas (Oct 2026)

`pages/admin/AdminBumpers.tsx`, ruta `/admin/bumpers`, permiso `programs` (se
reutiliza, no hay permiso propio), entrada en la sección Contenido del menú junto
a Programas.

- Los inputs de archivo de cada fila viven en un **único ref indexado por
  `bumper.id` y tipo** (`fileInputs.current[inputKey(id, kind)]`). Un ref por lado
  declarado a nivel de componente se resuelve a la **última** fila montada: con dos
  bumpers, "Subir intro" en el primero abría el input del segundo y el intro de un
  programa reemplazaba el del otro. `tests/bumpers/upload-inputs.test.ts` fija esa
  invariante; es una prueba de fuente, como las de `tests/perf/`.
- El selector de "pegado" se elige **al crear** y avisa en el propio control de que
  pegado no sirve para noticias, porque la fusión rompe la limpieza automática de la
  carpeta. El panel no sondea: la advertencia y `lastSyncedAt` se mueven tras una
  acción del admin o con el botón de reconciliar de la fila.
- `hasIntro`/`hasOutro` vienen del id guardado; cuando una reconciliación no
  consigue recuperar el archivo, el servicio limpia ese id a propósito para que el
  panel deje de mostrar "listo".

## Canales de YouTube en el panel (Oct 2026)

`pages/admin/AdminYouTube.tsx`, ruta `/admin/youtube`, permiso `youtube` (se
reutiliza). Los canales que la estación sigue se dan de alta, se quitan y se
renuevan desde acá; antes eran dos variables de entorno.

- **La página se lee como la cadena real**, en ese orden: canales, jobs de
  procesamiento, workers conectados, despliegue de versión. El bloque de canales
  va primero porque es el origen, y el dropzone de despliegue —el más técnico y
  el que menos se toca— quedó al final. No hay pestañas: una pestaña esconde
  justo lo que se vino a mirar.
- **La tabla de jobs ES la lista de notificaciones recibidas.** El webhook crea
  el `YouTubeVideo` y el `ProcessingJob` juntos, uno a uno, así que un listado
  aparte de "últimas notificaciones" mostraría las mismas filas con menos
  datos. Se llegó a escribir el endpoint `/notifications` y se quitó: la lista
  que hacía falta y no había era el "por canal" (`lastNotifiedAt` en cada fila).
- **`pages/admin/youtube/SilenceBar.tsx` es el único elemento expresivo de la
  página**: una regla de 2 px cuyo relleno ámbar mide el silencio de cada canal
  contra el más callado de la misma lista. Es decorativa (`aria-hidden`) porque
  el "hace 6 d" de la fila y su `title` llevan el mismo dato; si la barra fuera
  la única portadora, el color sería el único canal de información.
  El `ratio` se mide contra el canal **más antiguo**, no contra ahora, para que
  la comparación valga entre filas sin importar cuándo se pintó la lista.
  Cuando todos los canales llevan el mismo tiempo en silencio, `span` es `0` y
  todas las barras quedan llenas: colapsarlas todas a cero sería más dramático y
  menos cierto.
- **La página se partió en `pages/admin/youtube/`** (`ChannelList.tsx`,
  `SilenceBar.tsx`, `WorkerDeployCard.tsx`) porque `AdminYouTube.tsx` iba camino
  a 900 líneas. Solo se movió el bloque de despliegue, que es autocontenido; la
  tabla de jobs y la de workers se quedaron donde estaban.
- El formulario de alta es un `<form>` real, con `aria-invalid` y
  `aria-describedby` apuntando al error. Quitar un canal pide confirmación con
  un `AlertDialog` y su copy dice que los videos ya recibidos se conservan.
- `tests/youtube/panel-wiring.test.ts` fija lo que no se ve en una captura: que
  los dos caminos de subida leen la categoría de la misma fila, que el webhook
  rechaza canales no registrados, que no queda ninguna lectura de las variables
  retiradas fuera del backfill, y que `index.ts` ya no tiene el `setInterval` de
  resuscripción.

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

- **The committed dark world stays; distinction comes from hierarchy.** The
  sheet is the standard `bg-card`/`--border` surface, and every accent comes
  from tokens that already existed (`--primary`, `--faint`,
  `--muted-foreground`, `--destructive`). Two lighter-material iterations
  (cream paper, then dark kraft with a gold lamp) were rejected: no light
  surfaces in a fully dark app and no added color that fights the palette.
  The gold/paper tokens were removed again from `:root`, `tailwind.config.js`
  and `constants/theme.ts`.
- **The motive options read as options since v3.** `MotiveField` renders them
  as quiet pills (`min-h-11`, radio `sr-only` inside the visible label):
  idle `border-border` + `text-muted-foreground`, hover `border-primary/40`,
  selected `border-primary/60 bg-primary/10 text-primary` semibold.
- Every ruled row carries a signal through the existing tokens: the hairline
  is `border-border`, `focus-within` lights it `border-primary/60`, and
  `aria-invalid` turns it `--destructive` with the error sentence in
  `text-destructive` under the field (`aria-live="polite"`). Inputs stay
  borderless with `placeholder:text-faint/70`; labels are the `mono-meta`
  row only for counters, numeral and letterhead.
- **`--tally` appears exactly once on this page**, in
  `components/feedback/OnAirStamp.tsx` — after a successful POST the card
  swaps its contents to the seal (two concentric squares + lamp + `AL AIRE`)
  that draws itself with `pathLength`. Known debt: the public
  `--destructive` (0 62.8% 30.6%) is dark over `--card`; the error signal relies
  on the row border + the focused field — fixing the token belongs to the
  whole site, not this surface.
- No eyebrow above the `h1`, no gradient text; the heading still carries its
  own weight. On desktop the page is two columns (`main` is `max-w-5xl`, grid
  `lg:grid-cols-[minmax(0,1fr)_300px]` with the letterhead-stamped sheet at
  ≤640px and a sticky memo of "Qué pasa con tu mensaje" beside it); on mobile
  it stacks below. Copy is sober tuteo with no regionalisms: the form reads tú
  ("Escribe aquí lo que quieras contarnos", "Si dejas un nombre o un
  contacto, te respondemos"), except the consent sentence, where the first
  person ("los datos que escriba aquí") is deliberate and shared with the app.
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
  the **Redes** tab rather than a sixth tab. Same principles, native tokens:
  glass sheet (`Colors.surface` + `surfaceBorder`), mono letterhead, hairline
  rows with `borderGlass`/`danger` signals, motive as native pills (idle
  `Colors.border`, selected `Colors.signal` + `signalMuted`, 40dp pill plus
  hitSlop 4 = 48dp target), boxed soft inputs with dark keyboard and
  `Colors.signal` selection, consent spring with the success-green check, and
  indigo primary submit. Haptics kept; the stamp is rebuilt from plain views.
- `apps/web/PRODUCT.md` records the product truth and
  `apps/web/.impeccable/surfaces/` the surface direction contract (now v3).

## Unread prayer answers (Oct 2026)

The mobile app tells a listener they have an answer waiting. Two surfaces, both
driven by the same count, because one of them is the only thing visible all day.

- **The tab bar badge is the load-bearing one.** `hooks/usePrayerAnswers.tsx` is
  a provider mounted in `app/_layout.tsx` that owns a single
  `unreadAnswerCount` (poll every 60 s, foreground only, refetch on resume). It
  lives in a provider rather than in a hook because the tab bar and the prayer
  screens are separate trees and must not disagree. The number is rendered as a
  pill inside `tabBarIcon` (`UnreadAnswersBadge` in `app/(tabs)/_layout.tsx`),
  following the `LiveDot` precedent, not via `tabBarBadge` — that option only
  accepts a `TextStyle` and cannot be rounded into a pill. It is **signal
  indigo, not `--tally`**: tally is reserved for on-air state, and the Redes tab
  already pulses it.
- `app/prayer/[id].tsx` calls `acknowledgeAnswer()` optimistically right after
  posting the read receipt, so the badge drops the moment the answer is opened
  instead of waiting out the poll. A failed receipt self-heals on the next poll.
- **`app/prayer-history.tsx` derives its own count from the rows it rendered**
  (`requests.filter(hasUnreadAnswer)`), not from `unreadAnswerCount`, so the
  header summary and the cards cannot drift apart. The unread card stacks four
  cues on purpose — left edge bar, lifted card tint, a `Respuesta nueva` label
  and a breathing dot — because the green `RESPONDIDA` chip alone reads as
  "done". The dot is a slow opacity breathe gated on `useReducedMotion`, and the
  answer gets `numberOfLines={2}` only while unread so the label does not eat the
  only visible line of the response.
- `hasUnreadAnswer` tests `answerReadAt === null`, never falsy. A missing field
  means an older backend, and treating that as unread would light every badge
  after an app-only deploy.
- The prayer module still does not go through `@radio/types` / `@radio/api`:
  `apps/mobile/lib/prayer.ts` keeps its own `PrayerItem`. Widen both contracts in
  the same change when this area is next touched.

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
- Playback history: `pages/admin/AdminPlaybackHistory.tsx`, route
  `/admin/playback`, permission `dashboard`. It is two tabs over one shared
  filter bar, not two pages: `log` (chronological log) and `audios`
  (grouped by audio), and every filter except `order` applies to both, so the
  filter state lives above the tab and switching tabs keeps it. The tab is a
  segmented pair of buttons with `aria-pressed` rather than the shadcn Tabs
  primitive, because it sits inside the filter card next to the selects.
- The window presets are 7 / 30 / 55 days and **55 is the cap, not a
  preference**: the backend rejects a wider window, so a wider preset would be
  a 400. Default is 30.
- **`to` is inclusive here.** The panel sends the last day the window covers,
  not an exclusive bound, because `parseRange` in the backend derives the
  exclusive limit itself. Naming tomorrow would cover one extra day and push
  the 55 day preset over the retention cap.
- Both keys are built with `stationDayKey` from `lib/format.ts` instead of
  `toISOString().slice(0, 10)`, because the day has to be the station day and
  not the UTC one. `formatMoment` in the same file hardcodes the same zone.
- **Known debt: the frontend time zone is hardcoded to `America/Bogota` in
  `stationDayKey` and `formatMoment`, while the backend uses
  `config.locutor.timezone`.** They coincide today. If `TIMEZONE` stopped being
  Bogotá the panel would request one window and display another. Left as-is on
  purpose; fix it in one change that also exposes the station zone to the web
  app, not piecemeal.
- The page does **not** poll. It fetches on mount and whenever the admin
  changes something, plus the explicit `refreshToken` bump behind the
  "Actualizar" button. `loading` is derived from comparing `loadedKey` with the
  key of the request in flight rather than kept as its own flag, and an
  out-of-range page resets to 1 where the answer lands so the recovery costs no
  extra request.
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
- `apps/web/vite/seoPlugin.ts` owns two plugins: `perRouteSeoPlugin()`
  (`apply: 'build'`) writes `dist/<route>/index.html` for every public
  route, the generated catalog pages and `dist/sitemap.xml` in
  `writeBundle`; `devRouteSeoPlugin()` (`apply: 'serve'`) does the same
  substitution through `transformIndexHtml`. In dev the requested route is
  only in `ctx.originalUrl` — Vite normalises `ctx.path` to `/index.html`.
  `vite.config.ts` only registers them. The sitemap has exactly one
  writer, and it is that plugin.
- nginx needs no change to serve the per-route files: `try_files $uri $uri/`
  plus `index index.html` already resolves `/programacion` to
  `dist/programacion/index.html`. HTML is absent from
  `snippets/static-cache.conf`, so heads are not pinned by a long cache.
- **Every canonical carries a trailing slash, and that is not cosmetic.**
  nginx resolves `/programacion` to the directory `dist/programacion/` and
  301s the bare path, so the trailing-slash form is the only one that answers
  200. While the canonical pointed at the redirecting form, the index showed
  the `/info/*` pages with mixed slash forms and `/programacion` and
  `/opiniones` were not indexed at all. Google's canonicalization guide lists
  "a 3xx redirect" next to `rel="canonical"` as a common misconfiguration and
  warns that Google may pick a different canonical than the declared one, so
  the canonical has to name the URL that actually returns 200.
  `canonicalUrl()` in `seo.config.ts` is the only place that decides it, and
  `buildSitemapXml` reads the same function, so the sitemap cannot drift from
  the canonical. Re-evaluation after the fix is not instant: Google may hold
  pages in a duplicate cluster for up to two weeks.
- Unknown URLs answer 404, not the home page. `scripts/nginx/radio-global.conf`
  maps the client-side routes and `scripts/nginx/snippets/web-locations.conf`
  returns 404 for anything that is not one of them, so a typo or a scraper URL
  does not spend crawl budget on an infinite URL space. The admin panel lives
  on the same host and is in the map, so it stays reachable.
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

