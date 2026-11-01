# Testing strategy

The suite is Vitest across three workspaces plus a design-review CLI for agents.
`docs/testing.md` is the authoritative inventory in Spanish; this page is the
English summary and the reasoning behind the shape.

## Commands

| Command | Scope |
| --- | --- |
| `pnpm test` | Vitest in `apps/web`, `apps/mobile`, `backend` through Turbo |
| `pnpm typecheck` | `tsc` in every workspace that declares it |
| `pnpm test:design` | Only the design guardrails of web and mobile |
| `pnpm design:review` | Reviews the current diff and prints the manual checklist |
| `pnpm verify` | typecheck → test → design:review |

Only `@radio/web` declares that `test` depends on `build`, because
`tests/perf/` and `tests/catalog/buildOutput.test.ts` read `dist/`. Running Vitest
directly in web without a build makes those fail or silently skip. Mobile and
backend test against source and never generate the Prisma client.

## What each layer guarantees

| Workspace | Directory | Guarantee |
| --- | --- | --- |
| web | `tests/design/` | Tokens, contrast, motion, touch targets, accessibility, the review tool itself |
| web | `tests/perf/` | Bundle budget, import boundaries, static assets, per-route SEO |
| web | `tests/routing/` | Media URL normalization and the nginx route map |
| web | `tests/settings/`, `tests/youtube/`, `tests/bumpers/` | Panel wiring: the right control reads the right row, retired config is gone |
| web | `tests/catalog/` | Public catalog, SEO metadata, service worker, build output |
| web | `tests/artwork/` | The artwork switch reaches every surface |
| mobile | `tests/design/` | Palette and AA contrast, type, motion and reduced motion, haptics, 48 dp targets, loading states, tuteo |
| mobile | `tests/sse/` | The now-playing SSE polyfill |
| backend | `tests/settings/` | Cache, validation, service, routes, boot order |
| backend | `tests/bible/`, `tests/catalog/` | Seed and catalog service |
| backend | `tests/infrastructure/` | The pure suite never loads the Prisma client |
| backend | `tests/shared/` | Pagination, HTML escaping, filename to title, slug |
| backend | `tests/scripts/` | Deployment script wiring |

## Three styles, chosen on purpose

1. **Runtime** — import the module and call the function. Preferred whenever the
   logic is pure. Examples: `apps/web/tests/settings/form-values.test.ts`,
   `backend/tests/shared/utils.test.ts`.
2. **Source** — read the `.tsx`/`.css` file and assert an invariant the compiler
   cannot express (a class, an indexed ref, an `alt`). This is what
   `tests/design/` and `tests/perf/` do.
3. **Build** — build with Vite, then read `dist/`. Only when the thing under test
   is the build output.

A source test must not replace a runtime test when the function can be called. And
it must not assert literal copy: wording belongs to the manual checklist, so a
copy tweak does not break the suite for no reason.

## Why the design guardrails exist

Each one protects a failure that already happened or would be expensive to find in
production. They are not style preferences.

- `tokens.test.ts` — `.admin-theme` must redeclare every public token. A token
  without an override inherits the public palette, which is how an indigo ring
  appears inside the amber panel. Opacity-modifier tokens must be HSL triplets and
  every `hsl(var(--x))` in `tailwind.config.js` must keep `<alpha-value>`, or
  `bg-primary/10` silently generates nothing.
- `accessibility.test.ts` — `lang="es"`, zoom enabled, every `<img>` has `alt`,
  interactive classes have a visible focus state.
- `motion.test.ts` — the global `prefers-reduced-motion` block, the entrance-only
  route transition (no `exit`, no `AnimatePresence`), and the notice carousel
  stopping under reduced motion.
- `touch-targets.test.ts` — 44 px floor on the public site and the `.admin-theme`
  reset that allows dense tables.
- `design-review.test.ts` — the review tool's own rules and diff parser, so an
  agent cannot trust a broken tool.

## The review CLI

`pnpm design:review` compares the working tree against a base (`HEAD` by default)
and reviews **only added lines**. Existing debt in a file is not your failure.

Automatic rules, added lines only:

| Rule | Severity | Detects |
| --- | --- | --- |
| `design/raw-color` | error | `#hex`, `rgb()`, `rgba()`, `hsl()` with numbers outside token files |
| `design/emoji` | error | Emoji in UI code, outside comments |
| `design/img-alt` | error | An added `<img>` without `alt` |
| `design/slate-utilities` | warning | `slate-*` utilities in `pages/admin/` or `components/admin/` |
| `design/transition-all` | warning | `transition-all`, which animates properties that do not change |

The report ends with a manual checklist: hierarchy, states, responsive, copy,
motion, accessibility, tokens, consistency, risk. It is the part no test can
judge, and the expected deliverable is an answer to it, including what could not
be verified.

## What is deliberately not covered

- **A real browser.** No Playwright, no interaction tests. Source tests prove the
  wiring exists, not that a click works. Layout changes still need a visual check.
- **Visual regression.** No screenshots, no pixel comparison.
- **A database.** SQLite is not started in tests. `prismaFreeSuite.test.ts`
  guarantees the pure suite never drags Prisma in; anything that needs a query is
  either a source test or out of scope.
- **A React Native runtime.** `apps/mobile/tests/` runs in Node. No component
  mounting, no device measurement.
- **External services.** AzuraCast, ElevenLabs, Firebase and R2 are mocked or
  avoided.
- **On-screen copy.** The checklist covers tone; there are no text snapshots.

## Adding tests

- Name the file after the guarantee, not the component: `touch-targets`,
  `boot-order`, `form-values`.
- Prefer runtime; use source when the invariant is structural.
- Write the assertion message as the explanation of the failure. Whoever sees it
  at 3 a.m. should understand what broke without opening the test.
- Do not weaken a guardrail to make a change pass. If the rule no longer applies,
  the change includes the rule and its reason.
- A UI change must add or extend a test in that workspace's `tests/design/`. A
  backend change gets a behaviour test in the module.
