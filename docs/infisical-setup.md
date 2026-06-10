# Infisical Secret Manager Setup

This project now uses [Infisical](https://infisical.com) for managing secrets in production and staging environments.

## What changed

- **Backend**: The Express server now loads sensitive secrets from Infisical at runtime via the `@infisical/sdk`.
- **Local development**: You can still use `.env` files as a fallback. Infisical is only used when `INFISICAL_CLIENT_ID` is configured.
- **Frontend web**: The `VITE_GOOGLE_CLIENT_SECRET` was removed from the frontend `.env` because it is a server-side secret and should never be exposed in the browser.

## Required secrets in Infisical

Create these secrets in your Infisical project:

| Secret Name | Description |
|-------------|-------------|
| `AZURACAST_API_KEY` | API key for AzuraCast |
| `JWT_SECRET` | Secret for signing JWT session tokens |
| `PANEL_SECRET` | Secret for the admin control panel |
| `WORKER_AUTH_SECRET` | Shared secret for WebSocket worker authentication |
| `WEBHOOK_SECRET` | Secret for verifying incoming webhooks |
| `FB_VERIFY_TOKEN` | Facebook webhook verification token |
| `FB_APP_SECRET` | Facebook app secret |

Optional secrets that can also live in Infisical:

- `AZURACAST_URL`
- `AZURACAST_STATION_ID`
- `GOOGLE_CLIENT_ID`
- `ADMIN_WHITELIST`
- `PUBLIC_URL`
- `FRONTEND_URL`
- `YOUTUBE_CHANNEL_IDS`
- `PORT`
- `WS_PORT`
- `JOB_DISPATCH_INTERVAL_MS`
- `WORKER_HEARTBEAT_TIMEOUT_MS`
- `MAX_VIDEO_DURATION_SECONDS`
- `MAX_RETRY_ATTEMPTS`
- `KOKORO_URL`
- `MEDIA_DIR`
- `TIMEZONE`
- `STATION_NAME`

## Backend local setup

The backend uses a two-tier approach:

1. **`.env` file**: Contains only non-sensitive configuration (PORT, URLs, IDs, etc.).
2. **Infisical**: Contains all secrets (API keys, JWT secrets, tokens, etc.).

### Option A: Using Infisical (recommended for production/dev)

1. Copy the example file:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Fill in your Infisical credentials in `backend/.env`:
   ```env
   INFISICAL_CLIENT_ID=your_machine_identity_client_id
   INFISICAL_CLIENT_SECRET=your_machine_identity_client_secret
   INFISICAL_PROJECT_ID=your_project_id
   INFISICAL_ENVIRONMENT=dev
   ```

3. Upload all secrets listed in `backend/.env.infisical.example` to your Infisical project.

4. Start the backend:
   ```bash
   pnpm dev:backend
   ```

### Option B: Local development without Infisical

If you don't want to use Infisical for local development, keep the `INFISICAL_CLIENT_ID` empty and uncomment the secret placeholders at the bottom of `backend/.env`:

```env
INFISICAL_CLIENT_ID=

AZURACAST_API_KEY=your_local_key
JWT_SECRET=your_local_secret
...
```

## How it works

1. `backend/src/index.ts` loads `dotenv` first.
2. Then it calls `initializeInfisicalSecrets()` from `@radio/infisical-config`.
3. If Infisical credentials are valid, the SDK authenticates and fetches all secrets.
4. If Infisical credentials are invalid or missing, the backend logs a warning and continues with local `.env` only.
5. Secrets are merged into `process.env` (only if the variable is not already defined locally).
6. Then `config.ts` is loaded, reading the merged environment.

## Fallback behavior

If Infisical fails to connect (invalid credentials, network error, etc.), the backend **does not crash**. It logs a warning and continues using only local `.env` variables. If the required secrets are also missing from `.env`, then `config.ts` will throw an error as expected.

## Security notes

- Never commit real `.env` files to version control.
- The `.env.example` files are safe to commit and serve as documentation.
- For production, always use Infisical and leave secrets out of `.env` files.
- For local development, you can either use Infisical or keep secrets in `.env` (which is ignored by git).

## Worker

The worker (`worker/worker`) continues to use local `.env` files as requested. It does not connect to Infisical.
