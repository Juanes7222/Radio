# Visibilidad en Google — design

Date: 2026-10-21
Status: draft for approval
Scope: public web (`apps/web`) + the public backend endpoints it consumes

## Intent

The station is not selling anything. The goal is that someone searching for
sermons or worship music finds La Voz de la Verdad, lands on a page that is
about exactly what they were looking for, and starts listening. Every page
that can be found must end at the same place: the player.

The unit of ranking is therefore **not the home page**, it is the piece of
content the visitor was looking for. The home page is the conversion point
where the stream starts; the catalog pages are what bring people in.

## What already exists (verified, not assumed)

Everything below is live today and already public. The plan publishes it
rather than inventing it.

| Asset | Where it lives today | Size |
|---|---|---|
| Full Bible text, Reina-Valera 1960, verse by verse | `BibleVerse` / `BibleChapter` / `BibleBook` in SQLite | 66 books, 1.189 chapters |
| Public Bible API | `GET /api/bible/chapter?book=Job&chapter=1` returns the verses | working |
| Scheduled reading of the day | `GET /api/bible/reading/today` | working (7 chapters/day) |
| Bible full-text search | `GET /api/bible/search?q=` | working |
| Station library | `GET /api/search` returns the requestable songs with `artist`, `title`, `album`, `genre` | 1.193 songs |
| Weekly schedule with days, times, category | `GET /api/schedule` | 11 program titles |
| Program catalog | `GET /api/notification-programs` returns the manually marked notifiable subset | titles only |
| What actually aired, with the playlist it aired in | `PlaybackEvent` (55-day window), admin-only | working |
| YouTube channel and published videos | `YouTubeChannel` / `YouTubeVideo`, admin-only | working |
| Per-route head tags, sitemap, JSON-LD graph | `apps/web/src/config/seo.config.ts` | working |

The programs are `PREDICAS CONVENCION`, `LECTURA BIBLICA`, `REV JAVIER
CARRASCAL`, `REV HUMBERTO HENAO`, `REV JOSÉ SOTO`, `UN MENSAJE A LA
CONCIENCIA`, `HABLEMOS DE FAMILIA`, `PARA TI MUJER - MARIA MIRANDA`, `TU
HISTORIA PREFERIDA`, `NOTICIAS DE ISRAEL`, `En Vivo`.

## Goals

- Indexable pages for every program, every sermon, every artist, every Bible
  chapter.
- The text of those pages in the served HTML, not behind a client-side fetch.
- One listening path: a play control on every page that starts the stream.
- Measurement that tells us which queries bring listeners, not just clicks.

## Non-goals

- Ranking for head terms ("radio cristiana", "radio online") in the first
  months. That depends on authority and links, not on this work.
- A CMS. Content comes from the systems that already own it.
- A second frontend. The React app stays as it is.
- Prerendering the existing SPA pages (`/`, `/programacion`, `/opiniones`,
  `/info/*`). Their content is live and interactive; their head tags are
  already per-route and correct.

## Anti-goals

- Pages that exist only to be indexed. A page with no content a human would
  read is worse than no page.
- Content generated in bulk by a language model to fill an index. Google's
  scaled-content policy targets exactly that, and it is also not the mission.

## Decision: static HTML pages generated at build time

The catalog pages are **static HTML files written into `dist/` by a build
step**. They are not React routes and they do not hydrate.

Why:

- Google indexes the content of the served HTML. A client-rendered page is
  rendered by Googlebot in a second pass and indexed later; a static page is
  indexed as-is, with the text in the document.
- The catalog is stable. The 66 books, 1.189 chapters and 11 programs change
  on the order of months. The song library grows by a handful per week.
- One rendering stack. The React app, its design tokens and its deployment
  stay exactly as they are; the new pages are a separate, deliberately
  simple set of documents with their own small stylesheet.

Rejected: server-side rendering from Express. It would keep the content
fresh, but it adds a second HTML/CSS stack to a project that has one, and
the freshness that matters (the reading of the day) has its own route.

Rejected: React routes with a runtime fetch. It would reuse the design system
but the content would only exist after JavaScript runs, which is the thing we
are trying to avoid.

### Shape of the generated pages

Each page is a self-contained document:

- `<title>`, `<meta description>`, `<link rel="canonical">` with the trailing
  slash, Open Graph and Twitter tags.
- A JSON-LD block appropriate to the page type.
- One `<h1>`, the real text, and semantic sections.
- A play control: an `<audio>` element pointing at
  `/listen/la_voz_de_la_verdad/`, plus a prominent link to the home console.
  Plain HTML, no React, no provider stack.
- A link back to the React site and to the sibling pages, so the crawler
  walks the catalog.

### Where the data comes from

The public API cannot supply the whole catalog. `GET /api/search` returns
the requestable songs with `title`, `artist`, `album` and `genre` (that part
is real), but the sermon playlists, the playback mirror and the YouTube
rows are behind `requireAuth` and the AzuraCast API key. So the data comes
in two halves:

**Half one, in the backend: an export script.** A script in the backend
(`backend/src/scripts/export-catalog.ts`) uses the same services the backend
already has — `azuracastApi` for the requestable songs, Prisma for the Bible
tables and the YouTube rows — and writes one JSON artifact
(`apps/web/catalog/catalog.json`). It is the only place that needs a secret,
and it produces a file that can be reviewed in a diff. The artifact owns the
slugs: the book and the artist slugs are computed there, with the backend's
`slugify`, and the web build reads them instead of deriving its own.

**Half two, in the web build: the page generator.** The build reads that
JSON and writes the pages. It needs no credentials and no running backend,
so the frontend build stays reproducible offline.

`scripts/deploy.sh` already builds the backend before the web app, so the
export runs in between (backend build → export catalog → web build).

The generator caches what it fetches under `apps/web/.cache/` (gitignored)
so a rebuild does not depend on the backend being up.

### What is written by a human

- **Program descriptions.** `ScheduleCategory.description` exists and is
  editable in the panel, but it describes a *category* (there are four:
  Predicas, Contenido Variado, Noticias de Israel, En vivo) and it is empty
  in production. A *program* is a playlist title (PREDICAS CONVENCION, REV
  HUMBERTO HENAO, ...) and it has no home for a description. The home is a
  committed file, `apps/web/catalog/programs.ts`: slug, title, presenter,
  description. No migration, versioned with the content.
- **Sermon titles.** The title of a sermon is the file name in the library.
  If it reads as a file name, the page is not published (see Risks).

## Page inventory

| Route | Source | Count | Published now |
|---|---|---|---|
| `/biblia/` | `BibleBook` | 1 | yes |
| `/biblia/<book-slug>/` | `BibleBook`, `BibleChapter` | 66 | yes |
| `/biblia/<book-slug>/<n>/` | `BibleVerse` (free translation) | 1.189 | yes |
| `/alabanza/` | library grouped by artist | 1 | yes |
| `/alabanza/<artist-slug>/` | library | varies | yes |
| `/videos/` | `YouTubeVideo` | 1 | yes |
| `/programas/` | schedule + `catalog/programs.ts` | 1 | no, needs a description |
| `/programas/<slug>/` | schedule + `catalog/programs.ts` | ~11 | no, needs a description |
| `/predicaciones/` | sermon playlist items | 1 | no, needs real titles |
| `/predicaciones/<slug>/` | sermon playlist items | varies | no, needs real titles |
| `/lectura-de-hoy/` | `GET /api/bible/reading/today` | 1 | a React route, not generated |

Roughly 1.260 pages in the first wave, and about 1.300 once the program and
sermon pages are unblocked. One sitemap file handles that comfortably.

`/lectura-de-hoy/` is deliberately **not** a generated page. Its content is
"today" by definition and the deploy is triggered by a code change, so a
static file would freeze a page that claims to be current. It stays a React
route with per-route head tags, fetching the reading at runtime, and it
points at the static chapter pages, which are the ones that rank.

## Structured data per page type

- Every page: `Organization` + `WebSite` + `WebPage` from the existing graph
  in `seo.config.ts`, so the pages share the entity the site already declares.
- `/biblia/<book>/<n>/`: `Article` or `WebPage` with `about` the book and
  `isPartOf` the book page. Not `Text` — the text belongs to the publisher.
- `/videos/`: `VideoObject` per video, which is the type Google supports for
  video search.
- `/programas/<slug>/`: `BroadcastService` with the program as the channel,
  and `ItemList` for the episode list.
- `BroadcastService` is not a Google rich-result type. It is here for entity
  understanding, not for a player button. Do not expect a button in the SERP
  from it.

## No archive audio

The station library is not served to the public: nginx exposes no media
route for it, and a sequential AzuraCast playlist only holds what has not
been played yet, so the rotation rebuilds it every night and the files are
not a stable addressable archive.

So the generated pages do **not** offer the recorded audio of a sermon. They
offer what the mission actually asks for: a play control for the live
stream, the schedule of the program, and the link to the episode on YouTube
where it does exist. Opening a public media route for the library is a
separate project with its own bandwidth and permission questions, and it is
not in this plan.

## Technical work: what is done and what is left

1. **404 for unknown URLs — done.** `scripts/nginx/radio-global.conf` maps the
   client-side routes and `scripts/nginx/snippets/web-locations.conf` answers
   404 for anything else, so a typo or a scraper URL no longer spends crawl
   budget on an infinite URL space. The admin panel lives on the same host and
   is in the map, so it stays reachable. A typo under an existing prefix
   (`/info/typo/`, `/admin/typo`) is still a soft 404, the same behaviour the
   SPA has.
2. **The service worker — done.** It no longer overwrites the cached home
   page, and a navigation only enters the runtime cache when the response is
   the application shell, so the catalog pages stay out of it. The cache
   version was bumped, so the devices that installed the old worker get the
   new one.
3. **Sitemap — done, except the `lastmod`.** `dist/sitemap.xml` has exactly
   one writer, the SEO plugin, and it is written whether or not the catalog
   is present. The catalog URLs are added inside that same writer. What is
   left is the `lastmod`: it is still the deploy date for every URL, because
   the artists have no date of their own. The effect is low — Google
   re-crawls the URLs anyway — but it is not what this document asked for.
4. **Site names — done, with a different mechanism.** The Search Console
   page `webmasters.google.com/site-names` answers 404; the name is now
   declared the way Google documents it, with the `WebSite` structured data
   and `og:site_name`, and the `alternateName` sits on the `WebSite` node,
   where Google reads it.
5. **Core Web Vitals — still unmeasured.** The PageSpeed Insights API needs
   a key. The home page loads framer-motion, a live player and several
   vendor chunks, so INP is the metric at risk. Measure before and after.
6. **Reindex — the operator's job.** Ask Google to re-crawl the nine public
   routes after the canonical fix. Canonical re-evaluation can take up to
   two weeks. The runbook is `docs/runbooks/visibilidad-google.md`.
7. **The video rich result — deliberately not qualified.** The `VideoObject`
   declares the name, the description, the upload date, the thumbnail and
   the duration, which is what the data has. What it still lacks is a
   `contentUrl` pointing at a video file the site hosts: the page links to
   the watch page on YouTube instead, because the station does not serve its
   own video files. Until that changes, the page is an `ItemList` of videos
   and not a video rich result.

## Known gaps left open on purpose

- **The catalog has no visible entrance inside the application.**
  `/biblia/`, `/alabanza/` and `/videos/` are reachable from the sitemap and
  from a search, but not from a link in the React navigation: the only
  in-app path is the schedule to the reading of the day and from there to
  the chapters. Where the catalog should be linked from is a product
  decision, not a technical one, so it was left to whoever owns the screens.
- **The `lastmod` of the sitemap is the deploy date for every URL.** The
  artists have no date of their own; the chapters do. The effect on the
  crawl is low.
- **The program and the sermon pages are built but not published.** The
  generator refuses to publish a page with an empty description, and
  nobody has written those descriptions yet.
- **The videos index is capped at the 200 most recent**, and the older
  videos have no page of their own. There is no per-video page, only the
  index. 

## Off-site work (deferred by decision)

Deferred by decision on 2026-10-21: it needs a person to own it, and the
work that a person can do alone was done first. When it comes back:

- **Google Business Profile for the church in Cartago.** "Iglesia
  pentecostal en Cartago" is a real local query with a real local pack, and
  the physical location qualifies. This is the strongest local play
  available and it is not a website problem.
- **NAP consistency** across the site, the profile, the social accounts and
  the radio directories already pointing at the station (AppAgg and friends).
- **YouTube as the ranking surface.** The channel already receives videos
  automatically. `VideoObject` plus a video sitemap turns those into
  indexable pages, and YouTube is where "predicación" searches are won.
- **Podcast RSS.** A radio station that publishes an RSS feed becomes
  indexable in the podcast surfaces, which Google also indexes.

## Measurement

- Search Console property for `lavozverdad.com`, verified and submitted:
  sitemap, index coverage, and the performance report filtered to the pages
  that exist.
- The **Generative AI performance report** in Search Console, and the
  requirement that the site be included in the generative AI features to be
  eligible for them at all.
- A weekly look at queries, not clicks: which query, which page, and did the
  listener press play. The stream's own listener count is the real metric,
  and it exists in the admin panel.

## Phases

Status as of 2026-10-21: phases 0, 1 and 2 are implemented on the branch
`feat/visibilidad-google`, and phase 3 is deferred by decision. The
implementation plan with the task by task detail is
`docs/superpowers/plans/2026-10-21-visibilidad-google.md`.

### Phase 0 — technical corrections (days)

- Ship the canonical fix (done, tested) and the trailing-slash sitemap.
- 404 for unknown URLs, keeping the admin panel reachable.
- The service worker fix, before any static page exists.
- Accurate sitemap with real `lastmod`, still written by the one writer.
- Declare the site name.
- Submit and request reindexing of the current URLs.

**Done when:** every URL in the sitemap returns 200, an unknown URL returns
404, a visit to a catalog page does not poison the cached home page, and
Search Console reports the eight public routes as indexed.

### Phase 1 — the data and the page engine (about a week)

- `backend/scripts/export-catalog.ts` and the JSON artifact.
- The generator, its stylesheet, its layout.
- Seeding the free Bible translation (generalize `seed-bible.ts`).
- The first published pages: `/biblia/`, the 66 book pages, the 1.189
  chapter pages, `/alabanza/` and the artist pages.
- Sitemap integration, inside the existing writer.

**Done when:** a chapter page is served with its full text in the HTML, its
canonical points at itself, the sitemap carries every generated URL, and the
Rich Results Test and URL Inspection tool both read a page as expected.

### Phase 2 — the video index and the reading of the day (days)

- `/videos/` with `VideoObject` per video.
- `/lectura-de-hoy/` as a React route pointing at the chapter pages.
- The program and sermon pages stay unbuilt until there is a writer for
  them; the generator refuses to emit a page with an empty description.

**Done when:** the sitemap carries the whole published set and every page
has been submitted.

### Phase 3 — off-site (deferred)

Deferred by decision. When it comes back it starts with the Google
Business Profile for the church in Cartago, then the podcast RSS, then
mentions and directories.

### Phase 4 — measure and iterate (continuous)

- Weekly: queries, index coverage, listener count.
- Quarterly: Core Web Vitals, the generative AI report, and which programs
  deserve a page of their own.

## Risks

- **Thin pages.** 1.189 chapter pages built only from metadata are
  directories, not content. The chapter pages carry the actual text, which
  is what makes them worth indexing; the artist pages need the album and
  song list to be more than a name.
- **Two audiences on one host.** The 404 fix has to keep the admin panel
  reachable. Getting it wrong locks the team out of its own panel.
- **Index bloat.** ~1.300 URLs is fine, but a search facility that generates
  a URL per arbitrary query creates an infinite URL space, which is the
  soft-404 problem again. Search stays client-side or on a page that is not
  linked from the sitemap.
- **The preaching pages are the thinnest.** If the sermon titles in the
  library are file names, the pages will be too. They need a title, a
  preacher and a date before they are published; otherwise they are
  `noindex`.
- **Head terms will not move.** The first results for "radio cristiana" are
  held by domains with years of links. This plan wins the long tail
  (a specific preacher, a specific chapter, a specific song) and the brand,
  not the head term.

## Decisions taken (2026-10-21)

1. **Nobody writes the program descriptions for now.** So the program pages
   and the sermon pages are **not published in this plan**. A program page
   carrying only a name, a slot and a category is a directory entry, and a
   sermon page whose title is a file name is worse. Both stay in the design,
   ready to publish the day someone writes a paragraph for them. The plan
   starts with the parts that need no writer: the Bible chapters and the
   artists.
2. **The published Bible text is a free-to-redistribute translation.** The
   submodule `packages/assets/bible/Holy-Bible-XML-Format` ships about
   thirty Spanish translations. `SpanishRVGBible.xml` (Reina-Valera Gómez
   2004) declares `info="Copyright Allowed To Use - Reina Valera Gómez 2004"`
   in its own header (the typo is upstream's), is a modernisation of the
   public-domain 1909 and reads in modern Spanish: that is the one to
   publish. `Spanish1569Bible.xml` and
   `Spanish1858Bible.xml` carry the literal status "Public Domain" and are
   the zero-ambiguity fallback; `SpanishPDTBible.xml` (La Palabra de Dios
   para todos, Bible League International) is the most readable but comes
   from a private publisher. Seeding it is a generalization of
   `backend/scripts/seed-bible.ts`, which today hardcodes RVR1960.
   The app keeps showing RVR1960 to the congregation; the published pages
   use the free translation.
3. **No Google Business Profile for now.** The local play is deferred.
4. **No podcast RSS for now.** Also deferred.
5. **Off-site work as a whole is deferred.** Phases 0, 1, 2 and 4 are the
   plan; the off-site phase waits for a person to own it.

## Consequences for the page inventory

`/programas/<slug>/` and `/predicaciones/<slug>/` are designed but not
generated. The generator knows how to build them and the data is in the
export; what is missing is the human text, and the generator refuses to
emit a page whose description is empty rather than publish a thin page.

## Calls I made, so they can be checked while reading

- The catalog pages are static HTML generated at build time, not React
  routes and not server-side rendering.
- The data comes from an export script in the backend, because the public
  API does not expose the sermon playlists, the playback mirror or the
  YouTube rows.
- The program descriptions live in a committed file, not in the database,
  because a program is a playlist title and has no column to live in.
- The pages do not offer recorded audio. They offer the live stream, the
  schedule and the YouTube episode.
- `/lectura-de-hoy/` stays a React route, because a static page cannot
  honestly say "today" when the deploy happens on a code change.
- The category descriptions in the panel are left alone; they describe the
  four categories, not the programs.
- The published Bible text is Reina-Valera Gómez 2004, not the 1569: it is
  explicitly allowed to be used, it descends from the public-domain 1909 and
  it reads in modern Spanish, which matters for a page meant to be read.
- The generator refuses to publish a page with an empty description, rather
  than publishing a thin one.

## Rulings taken while implementing

Each of these was a decision the plan left open, or a plan defect the
implementation found. The cost is what it would take to undo it.

- The sitemap has exactly one writer, the SEO plugin, which writes the catalog
  pages and the sitemap in the same pass, with or without the artifact. Cost:
  one extra plugin, no behavioural difference.
- The catalog path is resolved from `__dirname`, never from the process
  working directory. Cost: the plugin falls back to the environment variable.
- The shared types are imported type-only in the web app. Cost: the types
  package has to be built before the web build, which the deploy does.
- The plan's test fixture used book number 19 for Job, but Job is 18 and 19 is
  Salmos. The plan text was wrong and the fixture was corrected. Cost: one
  character in a test fixture.
- The web app has no slug module: the backend export computes the book and the
  artist slugs and the artifact carries them, so there is a single
  implementation of the rule. Cost: the web has to derive a slug on its own
  when the deferred program pages are unblocked.
- The export runs inside the frontend deploy, immediately before the web
  build, and the infisical package and the Prisma client are built
  unconditionally: the producer has to run with its consumer. Cost: a
  frontend-only deploy now writes to the production database, and only on a
  server that never seeded the published translation.
- The plan's default artifact path resolved against the working directory and
  landed one level above the repository, where the web build never looks. It
  is resolved from `__dirname` now. Cost: the deploy ships no catalog pages,
  silently.
- The canonical of a generated page is `SITE_URL` plus its path, and the path
  always ends with a slash. Cost: a second slash expression, which is the
  thing this avoids.
- The sibling chapter list became a previous/next pair plus the link to the
  book page: the full list on every chapter page of a book was quadratic, and
  Salmos has 150 chapters. The bundle budget keeps measuring the app and the
  catalog got its own ceilings. Cost: the catalog can grow to 30 MB before
  anything complains.
- A corrupt artifact stops the deploy on purpose, so the diagnostic names the
  file and what is wrong with its shape. Cost: the deploy aborts, which is
  the intended behaviour.
- An unknown URL answers 404 with a real status code, and the allowlist is
  by prefix, because the SPA's own routing is by prefix too. Cost: a few
  typo URLs under `/info/` and `/admin/` still return the shell.
- The runbook is in Spanish, because its reader is the operator. Cost: one
  file in a different language than the rest of `docs/`.
- The site name is declared with the `WebSite` structured data and
  `og:site_name`, because `webmasters.google.com/site-names` answers 404.
  The `alternateName` sits on the `WebSite` node, where Google reads it.
  Cost: the operator follows a page that does not exist.
- The build carries the name to slug map to the runtime, and a book that is
  not in the map renders without a link. Cost: a rotation over another
  translation produces no link instead of a link to a page that was never
  published.
- The backend suite must not need a generated Prisma client, so the
  `disconnectPrisma` helper and its test are gone and the cleanup is inline
  in the export CLI. Cost: one helper with a caller.
- The FTS index is rebuilt before the seed's early return, so a failed
  rebuild is retried by the next deploy. Cost: one extra rebuild per deploy.
- A navigation enters the service worker runtime cache only when the response
  is the application shell, recognised by the `<div id="root">` marker, and
  the cache version was bumped. Cost: the runtime cache stops refreshing the
  shell, which degrades the offline fallback without breaking it.
- The 404 path keeps the limit of `location /`: the measurement in nginx
  1.30 showed the request is already counted before `try_files` hands it to
  `@spa`. Cost: on another nginx version the request could be counted twice.
- The videos index is capped at the 200 most recent and the page says so.
  Cost: the older videos are not reachable from the site, because there is
  no per-video page.
