# Context map for AI agents

This repository is large enough that reading it end to end is wasteful. This page
maps a task to the smallest set of files that answers it.

## How instructions are loaded

`opencode.jsonc` lists, under `instructions`:

```
AGENTS.md
docs/project-context.md
docs/backend-context.md
docs/frontend-context.md
```

`AGENTS.md` imports the same three context files. They are always in context, so
they are optimization targets: they must stay short and current. This suite is
the detail layer they point to; do not duplicate it back into them.

If you need to change what every agent reads, that list is the whole mechanism.

## Task to files

| Task | Read first | Then |
| --- | --- | --- |
| Add an endpoint | `reference/backend-modules.md` | the target module's `.routes.ts`, `auth.middleware.ts` |
| Add a scheduled job | `explanation/background-jobs.md` | `jobs/scheduler.ts`, `systemJobs.registry.ts` |
| Change the database | `how-to/change-the-database.md` | the matching `prisma/schema/*.prisma` file |
| Add a station setting | `reference/configuration.md` | `modules/settings/settings.catalog.ts` |
| Fix a panel page | `explanation/design-system.md` | the page in `apps/web/src/pages/admin/`, `useAdminApi` |
| Fix a public page | `explanation/design-system.md` | the page plus `components/layout/PublicLayout.tsx` |
| Fix the mobile app | `how-to/work-on-the-mobile.md` | `app/`, the matching hook, `constants/theme.ts` |
| Understand an audio problem | `explanation/live-audio.md` | `locutor/playback.job.ts`, `streamer.service.ts`, `liveState.service.ts` |
| Understand content ingestion | `explanation/content-pipeline.md` | `youtube/*`, `programs/*`, `rotation/*`, `bumpers/*` |
| Deploy | `how-to/deploy-and-rollback.md` | `scripts/deploy.sh` |
| Restore data | `how-to/restore-a-backup.md` | `scripts/radio-restore.sh` |
| Add a permission | `reference/permissions.md` | `packages/types/src/admin.ts` + the module routes |
| Diagnose a bug with no stack trace | `explanation/known-traps.md` | `explanation/systematic-debugging` skill |
| Write tests | `explanation/testing-strategy.md` | the workspace's `tests/` folder |

## Minimum viable context by workspace

If you are editing...

**Backend:** `backend/src/modules/<feature>/` (all files), `backend/src/app.ts`,
`backend/src/config/`, and the Prisma schema file for the tables involved. The
permission constant lives in `packages/types/src/admin.ts`.

**Web panel:** `apps/web/src/pages/admin/<Page>.tsx`, `apps/web/src/hooks/useAdminApi.ts`,
`apps/web/src/index.css` (tokens), and `NAV_SECTIONS` in `AdminLayout.tsx` if the
route is new.

**Web public:** the page, `apps/web/src/components/layout/PublicLayout.tsx`,
`apps/web/src/config.ts`, and `packages/api/src/api.ts` if a request is involved.

**Mobile:** `apps/mobile/app/<route>.tsx`, the hook in `hooks/`, `lib/` helpers,
and `constants/theme.ts`.

**Worker:** `worker/worker/src/` plus `backend/src/modules/workers/protocol.types.ts`.
Both sides of the protocol must change together.

## Commands an agent should run before claiming success

```bash
pnpm typecheck                      # or the workspace filter
pnpm --filter <workspace> run test
pnpm design:review --strict         # after touching UI or copy
```

`pnpm verify` runs all three. A design change also requires answering the manual
checklist that `design:review` prints; an unverified item is stated, not omitted.

## Things that look like a bug and are not

- No artwork anywhere: `ARTWORK_ENABLED` is `false` on purpose.
- `Peticion no encontrada` on a valid id: the id is a UUID capability.
- Rotations include files whose chapter is unknown in `unresolved`.
- `/api/feedback` returns 404 from a browser: it is `POST` only, and the public
  list endpoint does not exist by design.
- The panel's log viewer shows no lines for its own polls: `SILENT_LOG_PATHS`.

## Etiquette for changes here

- Read the module you are changing before proposing a refactor of it.
- Keep the change inside the module. New abstractions need a second caller.
- If a comment documents a measurement (milliseconds, seconds, bytes), do not
  delete it as noise; it is the only record of why the code looks odd.
- If you find prose that contradicts the code, fix the prose in the same change,
  or note it. This suite has already corrected three README claims.
