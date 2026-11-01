# Design system

Three surfaces, two palettes, one font family. The panel and the public site share
a bundle but not a theme; the mobile app mirrors the public palette with its own
surface scale.

## One rule that explains most of the code

`:root` declares the public tokens, `.admin-theme` **redeclares all of them**.
A token that exists only in `:root` leaks into the panel, and the symptom is
always the same: an indigo element inside an amber UI.

```css
/* apps/web/src/index.css — the values that matter */
:root {
  --background: 222.2 84% 4.9%;   /* night blue */
  --primary:    244 83% 74%;      /* #8D86F4 indigo */
  --radius:     1rem;
  --tally:      353 75% 55%;      /* on-air red */
}

.admin-theme {
  --background: 224 30% 4.5%;     /* studio night */
  --primary:    38 95% 62%;       /* signal amber */
  --radius:     0.5rem;
  --tally:      353 75% 55%;
}
```

`apps/web/tests/design/tokens.test.ts` enforces the symmetry. Do not add a public
token without adding its admin counterpart.

## Semantic tokens

Mapped in `tailwind.config.js`: `background`, `card`, `popover`, `primary`,
`secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, plus
`sunken`, `faint`, `success`, `warning`, `info`, `tally`.

Two mapping details that break silently if changed:

- Every token color must keep `/ <alpha-value>`. Without it, `bg-primary/10`
  generates nothing and the element renders unstyled.
- `tally` is reserved for on-air state. It is not a general error or emphasis
  colour; `destructive` exists for that.

Literal `slate-*` utilities still exist in older admin pages. Migrating them is
known debt (`design/slate-utilities` warns on new ones).

## Typography

| Surface | Families |
| --- | --- |
| Web | IBM Plex Sans Variable (UI), IBM Plex Mono (timecodes, IPs, ids, section eyebrows), Instrument Serif (editorial headings) |
| Mobile | Fraunces (display), Instrument Sans (UI), IBM Plex Mono (labels) |

Fonts are loaded via `@fontsource` in `main.tsx`, not from a CDN, so the CSP stays
narrow and there is no third-party request on load.

## Layout primitives

- **Public site:** `PublicLayout` owns the persistent chrome — health banner,
  header, mini player, prayer dialog. A page must not render its own `Header`; the
  prop is required, so a page-level header fails to compile.
- **Panel:** `AdminLayout` owns the sidebar and topbar. `NAV_SECTIONS` groups items
  into Emisión / Contenido / Audiencia / Sistema and is also the source of the
  topbar title.
- **Mobile:** Expo Router `app/` is routing only; reusable pieces live in
  `components/`, `hooks/` and `lib/`.

## Motion

- `LazyMotion` with `domAnimation` and `MotionConfig reducedMotion="user"` wrap the
  whole web app.
- The route transition is **entrance-only**: `initial` and `animate`, no `exit`.
  `AnimatePresence mode="wait"` around `<Outlet />` cannot work as written, because
  the exiting child already resolves to the incoming route, so the incoming page
  mounts once hidden and again for real. That double mount was measurable.
- `useReducedMotion` gates the mobile breathing animations (unread answer dot,
  on-air pulse).

## Touch targets

The public site has a global 44 px floor. `.admin-theme` resets it, which is what
allows dense tables without stretching every button. Mobile targets are 48 dp.
All three are asserted in tests.

## Accessibility baseline

`lang="es"`, no zoom lock, `alt` on every image, visible focus on interactive
classes, `aria-invalid` plus `aria-describedby` on form errors, `aria-live` on
error text, and labelled controls for icon-only buttons. Dialogs move focus on
open and return it on close.

## The feedback page as a worked example

`pages/OpinionesPage.tsx` is the most recent deliberate design decision and shows
the house style:

- The dark world stays; distinction comes from hierarchy, not from a lighter
  material. Two lighter iterations (cream paper, then dark kraft with a gold lamp)
  were rejected and their tokens removed again.
- Every accent comes from existing tokens (`--primary`, `--faint`,
  `--muted-foreground`, `--destructive`).
- The motive options render as quiet pills with a `sr-only` radio inside a visible
  label, 44 px minimum.
- `--tally` appears exactly once, in `components/feedback/OnAirStamp.tsx`, after a
  successful submission.
- Client validation reads `FEEDBACK_LIMITS` from `@radio/types`, the same constants
  the backend validates against.
- On failure the first offending field takes focus; on success the confirmation
  heading is focused through a `tabIndex={-1}` ref.

## Known design debt

Recorded here so it is not rediscovered as a "bug":

- `--destructive` on the public surface is dark over `--card`; the error signal
  relies on the row border and the focused field. Fixing the token affects the
  whole site.
- Remaining `slate-*` utilities in older admin pages.
- Duplicated `DetailRow`, status-badge maps and skeletons across admin pages.
- Two segmented-control implementations and two checkbox implementations.
- The upload dropzone is not keyboard accessible.
- `AdminScheduleCategories` still uses native `confirm()`.
- The frontend time zone is hardcoded to `America/Bogota` in `lib/format.ts`
  while the backend uses `config.locutor.timezone`. They coincide today.
- `RadioPlayer`, `MobilePlayerHero`, `SongInfo` and `SongHistory` are deprecated
  and tree-shaken out, but they still read `song.art` directly.

## Artwork is switched off

`src/lib/artwork.ts` is the single decision point. `ARTWORK_ENABLED` is `false` and
`resolveArtworkUrl` returns `null`. AzuraCast serves a full-resolution JPEG per
track, which is too heavy for a listener on mobile data. Every surface already
falls back to `VinylDisc` or an icon, so the switch is invisible except that
there are no covers.

Consumers must go through `resolveArtworkUrl` instead of reading `song.art`, or
the switch does not reach them. `tests/artwork/artwork-switch.test.ts` enforces
both halves. `AdminUpload` is the deliberate exception: it shows the cover of the
file just uploaded as a verification affordance.

## Mobile tokens

`apps/mobile/constants/theme.ts` mirrors the public palette with its own surface
scale (glass overlays over `ink`), and keeps `signal` at the public indigo
`#8D86F4`. The mobile scale is not the web scale: the web shares the family, not
the values. Aliases `accent` and `cian` point at `signal` for compatibility.

Mobile design guardrails live in `apps/mobile/tests/design/` (30+ files). A new
token or control should extend that folder, never start a second convention.
