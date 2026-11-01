# Getting started

Get the backend, the web app and (optionally) the mobile app running against a
real AzuraCast instance, and verify each one answers. This is a lesson, not a
reference: do the steps in order.

Time: about 30 minutes, most of it waiting for installs and for an AzuraCast API
key.

## What you need before starting

- **Node.js 22.** The web build needs `>= 22.22.0` because of React Router 8.
- **pnpm 10.11.0.**
  `corepack enable && corepack prepare pnpm@10.11.0 --activate`
- **A reachable AzuraCast instance** with an API key and the station id.
- **A Firebase project** if you want the panel login to work. Without it the
  listener site runs and the panel returns `500 Firebase Auth no está configurado`.
- Git, with permission to clone submodules.

You do not need Python unless you are running `scraping/`.

## Step 1 — Clone with submodules

```bash
git clone --recurse-submodules https://github.com/Janes7222/Radio.git
cd Radio
```

`--recurse-submodules` matters. `packages/assets/Bible` (the XML corpus) and
`worker/` are separate repositories. Without them the Bible reader has nothing to
seed and the worker cannot be built.

If you already cloned without it:

```bash
git submodule update --init --recursive
```

## Step 2 — Install

```bash
pnpm install
pnpm --filter radio-admin-backend run prisma:generate
pnpm --filter radio-admin-backend run prisma:migrate
```

`prisma:migrate` is `migrate dev`, which creates and applies migrations locally.
It may reset the database when it detects drift, which is fine on your machine and
never acceptable in production.

Note the package name: the workspace is `@radio/backend` but the historical
`radio-admin-backend` alias still appears in some scripts and docs. Both point at
the same directory.

## Step 3 — Configure the backend

```bash
cp backend/.env.example backend/.env
```

Only five values must be real to boot. Everything else has a default:

| Variable | What to put |
| --- | --- |
| `PUBLIC_URL` | `http://localhost:3000` for local work |
| `PANEL_SECRET` | any long random string |
| `JWT_SECRET` | any long random string |
| `WORKER_AUTH_SECRET` | any long random string |
| `AZURACAST_URL`, `AZURACAST_API_KEY`, `AZURACAST_STATION_ID` | from your AzuraCast instance |

Then set the ports explicitly:

```dotenv
PORT=3000
WS_PORT=3001
```

Both default to `3001`. Leaving them unset makes the second listener fail with
`EADDRINUSE` and you will spend an hour wondering why workers never connect.

A missing required value throws at import: the process prints
`Env X is not defined` and exits. That is the intended behaviour, not a bug in
your setup.

## Step 4 — Configure the web app

```bash
cp apps/web/.env.example apps/web/.env
```

Set:

```dotenv
VITE_API_BASE_URL=
VITE_API_PROXY_TARGET=http://localhost:3000
```

Empty base URL means same-origin: the browser calls `/api/...` on the Vite dev
server, and Vite forwards to the target. This keeps CORS, cookies and SSE out of
the picture. A bare host such as `localhost:3000` is rejected on purpose; the app
throws at startup because that value used to be silently resolved as a relative
path.

## Step 5 — Run it

```bash
pnpm dev:backend
```

The log should show, in this order: Infisical (present or not), settings hydrated,
the scheduler's job list, `Backend running on http://localhost:3000`, then the
worker WebSocket server.

In a second terminal:

```bash
pnpm dev:web
```

Vite prints the resolved proxy target on boot, for example
`[vite] API dev proxy -> http://localhost:3000`. If that line shows something you
did not expect, fix `VITE_API_PROXY_TARGET` before opening the browser.

## Step 6 — Verify each layer

Run these in order; the first failure tells you which layer to fix.

```bash
# 1. Liveness
curl http://localhost:3000/health

# 2. AzuraCast reachability through the backend
curl http://localhost:3000/api/nowplaying

# 3. Public site
#    open http://localhost:5173 and check that the player shows station metadata
```

Then open `http://localhost:5173/admin/login`. If Firebase is configured, sign in
with the Google account in `SUPERADMIN_EMAIL` or `ADMIN_WHITELIST`. If not, skip
the panel for now.

Swagger UI is at `http://localhost:3000/docs` while the backend runs. It is
generated from the routes on build, so it lags a new endpoint until
`pnpm dev:backend` or `pnpm build` runs again.

## Step 7 — Mobile (optional)

```bash
cp apps/mobile/.env.example apps/mobile/.env
pnpm dev:mobile
```

`EXPO_PUBLIC_BACKEND_URL` must be reachable from the device:

- Android emulator: `http://10.0.2.2:3000`
- Physical device: your machine's LAN IP, for example `http://192.168.1.20:3000`

`localhost` will not work on a device: it points at the device itself.

## What you just proved

- The backend boots past config validation, which means secrets, ports and
  AzuraCast coordinates are correct.
- `/api/nowplaying` answering proves the AzuraCast key and station id work and
  that media URL rewriting did not break the payload.
- The panel login proves Firebase Auth and the JWT exchange work. If the panel
  loads but every action fails with `401`, you are looking at a different problem:
  see `explanation/auth-and-sessions.md`.

## Where to go next

| You want to... | Read |
| --- | --- |
| Point the local frontend at the production backend | `how-to/develop-locally.md` |
| Understand the module you will edit | `reference/backend-modules.md` |
| Make your first change safely | `how-to/work-on-the-backend.md` |
| Avoid the traps that cost hours | `explanation/known-traps.md` |
| Ship it | `how-to/deploy-and-rollback.md` |
