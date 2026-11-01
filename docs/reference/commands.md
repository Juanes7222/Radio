# Commands

Every command is run from the repository root unless stated otherwise. The
package manager is pnpm 10.11.0 and the task runner is Turborepo.

## Root scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | All workspaces in watch mode (Turbo, persistent) |
| `pnpm dev:backend` | Backend only: regenerates Swagger, then `ts-node-dev` |
| `pnpm dev:web` | Vite on 5173 |
| `pnpm dev:mobile` | Expo dev server |
| `pnpm dev:docker` | Backend + web through `docker-compose.dev.yml` |
| `pnpm build` | Turbo build across workspaces |
| `pnpm lint` | Turbo lint |
| `pnpm typecheck` | Turbo typecheck |
| `pnpm test` | Vitest in web, mobile and backend |
| `pnpm test:design` | Only the design guardrails of web and mobile |
| `pnpm design:review` | Reviews the current diff, then prints the manual checklist |
| `pnpm verify` | `typecheck` → `test` → `design:review`, in that order |

`pnpm design:review` accepts `--base <ref>`, `--json` and `--strict`. It only
checks added lines, so pre-existing debt in a file does not fail your change.
Exit codes: `0` clean, `1` errors (or warnings under `--strict`), `2` tool or git
failure.

## Backend

Run these with `pnpm --filter @radio/backend run <script>`.

| Script | What it does |
| --- | --- |
| `dev` | Swagger + `ts-node-dev --respawn` |
| `build` | Clears `dist`, `prisma generate`, Swagger, `tsc` |
| `start` | Not defined; production runs `node dist/index.js` through systemd |
| `typecheck` | `tsc --noEmit` |
| `test` / `test:watch` | Vitest |
| `swagger` | Regenerates `src/swagger-output.json` |
| `prisma:generate` | `prisma generate --schema prisma/schema` |
| `prisma:migrate` | `prisma migrate dev` — development only |
| `prisma:migrate:deploy` | `prisma migrate deploy` — production only |
| `prisma:migrate:status` | Pending migrations |
| `prisma:migrate:resolve` | Mark a migration as applied or rolled back |
| `seed:bible:published` | Seeds the published Bible translation |
| `youtube-channels:backfill` | One-off: env channels into `YouTubeChannel` |
| `voice-keys:backfill` | One-off: `ELEVENLABS_API_KEYS` into encrypted rows |
| `catalog:export` | Writes the public catalog consumed by the generated pages |

The npm scripts always pass `--schema prisma/schema`. Prefer them over calling
the Prisma CLI by hand; a bare `prisma generate` looks for `prisma/schema.prisma`
and fails.

## Web

Run with `pnpm --filter @radio/web run <script>`.

| Script | What it does |
| --- | --- |
| `dev` | Vite dev server, prints the resolved proxy target |
| `build` | `tsc -b` then `vite build` (the SEO plugin writes per-route HTML) |
| `preview` | Serves `dist` |
| `lint` | ESLint |
| `test` | Vitest |
| `typecheck` | `tsc -b` |

Tests under `tests/perf/` and `tests/catalog/buildOutput.test.ts` read `dist/`.
Running Vitest directly without a build makes them fail or silently skip. That is
why `apps/web/turbo.json` declares `test` depends on `build`.

## Mobile

| Script | What it does |
| --- | --- |
| `pnpm --filter @radio/mobile run dev` | Expo dev server |
| `... run android` | Writes `google-services.json`, then `expo run:android` |
| `... run ios` | `expo run:ios` |
| `... run build:android` | `eas build --platform android` |
| `... run build:ios` | `eas build --platform ios` |
| `... run update` | `eas update --channel production` |
| `... run lint` / `test` | ESLint, Vitest |

`postinstall` patches `react-native-track-player`; a fresh install without it
leaves the player broken in ways that look like application bugs.

## Deployment and operations

Run on the server as root.

| Command | What it does |
| --- | --- |
| `sudo bash scripts/setup.sh --panel-pass <password> --certbot-email <email>` | Provisions a fresh Debian host once |
| `sudo bash scripts/deploy.sh [--backend] [--frontend] [--skip-audit] [--force]` | Release with audit gate, health check and rollback |
| `bash scripts/radio-backup.sh` | Backup now |
| `sudo bash scripts/radio-restore.sh --from r2 --date 20260911` | Verified restore |
| `bash scripts/restart.sh` / `start.sh` / `stop.sh` | Backend service control |

`deploy.sh` environment knobs: `HEALTH_URL` (default
`http://127.0.0.1:3000/health`), `HEALTH_RETRIES` (15), `HEALTH_INTERVAL` (5),
`PNPM_BIN`, `DEPLOY_AUDIT_ALLOWLIST`. The lock file is
`/tmp/radio-deploy.lock` and the log `/var/log/radio-deploy.log`.

## Common one-off commands

```bash
# Regenerate the Prisma client after a schema edit
pnpm --filter @radio/backend run prisma:generate

# Check what migrations are pending in production
pnpm --filter @radio/backend run prisma:migrate:status

# Run a single backend test file
pnpm --filter @radio/backend exec vitest run tests/settings/service.test.ts

# Run the design guardrails of one workspace
pnpm --filter @radio/web run test tests/design
pnpm --filter @radio/mobile run test tests/design

# Inspect the resolved API base URL failures
pnpm --filter @radio/web run dev   # throws at startup on an invalid VITE_API_BASE_URL
```

## Ports you will actually use

| Service | Port |
| --- | --- |
| Backend HTTP (dev) | 3000 in the examples, 3001 by default |
| Worker WebSocket | 3001 in the examples, must differ from `PORT` |
| Vite | 5173 |
| Vite preview | 4173 |
| Expo dev server | 8081 |
| AzuraCast panel | 8080 |
| Icecast | 8000 |
