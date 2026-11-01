# Permissions

The panel has three roles and 21 permissions. The roles are coarse and the
permissions are the real model; both sides of the stack read the same list from
`packages/types/src/admin.ts`.

## Roles

| Role | Effective permissions | Notes |
| --- | --- | --- |
| `SUPERADMIN` | all 21 | The only role that can manage users, backups and voice keys. Bootstrapped from `SUPERADMIN_EMAIL` on first login. |
| `ADMIN` | all except `users` | Derived at runtime, not stored: adding a permission to the catalog grants it to every ADMIN automatically. |
| `USER` | only what is stored in `permissions` | The `permissions` column is a JSON array validated against the catalog. |

`effectivePermissions()` in `backend/src/modules/auth/permissions.ts` and
`hasAdminPermission()` in `packages/types/src/admin.ts` implement the same rule.
The backend is the authority; the frontend copy exists only to hide navigation
and buttons. Never rely on the frontend check for security.

## The 21 permissions

| Permission | Label in the panel | Guards |
| --- | --- | --- |
| `dashboard` | Dashboard | Dashboard, health watchdog, playback history, listener history |
| `schedule` | Programación | Schedule view and the narrow now-playing passthrough |
| `schedule.categories` | Tipos de programa | Schedule categories |
| `streaming` | Streaming / DJs | DJ assignments, relay status and stop, live admin status |
| `live` | Transmitir en vivo | Going live from the browser (`/admin/live`) |
| `upload` | Subir archivo | MP3 upload, rescan, delete |
| `playlists` | Playlists | Playlist management |
| `programs` | Programas | Programs **and** bumpers (reused, no separate permission) |
| `rotations` | Rotaciones | Rotations, source preview, align |
| `reading.history` | Historial de lectura | Reading history only |
| `locutor` | Locutor | Templates, audio bank, announcement planning and settings |
| `youtube` | YouTube | Channels, processing jobs, workers list |
| `requests` | Solicitudes | Song request moderation |
| `prayer` | Oración | Prayer inbox, answers, SSE ticket |
| `feedback` | Opiniones | Opinions inbox |
| `devices` | Dispositivos | Device registry, push campaigns, zones, notifiable programs |
| `notices` | Avisos | Notices and the media libraries |
| `logs` | Bitácora | Log viewer |
| `jobs` | Jobs | System job catalog and release uploads |
| `users` | Usuarios | Admin user management (ADMIN does not get this) |
| `settings` | Ajustes | Station settings read and write |

## Panel route to permission

From `NAV_SECTIONS` in `apps/web/src/pages/admin/AdminLayout.tsx`, which is also
the source of the topbar title.

| Route | Permission | Extra |
| --- | --- | --- |
| `/admin/dashboard` | `dashboard` | |
| `/admin/health` | `dashboard` | |
| `/admin/playback-history` | `dashboard` | |
| `/admin/schedule` | `schedule` | |
| `/admin/schedule/categories` | `schedule.categories` | |
| `/admin/streaming` | `streaming` | |
| `/admin/live` | `live` | |
| `/admin/upload` | `upload` | |
| `/admin/playlists` | `playlists` | |
| `/admin/programs` | `programs` | |
| `/admin/bumpers` | `programs` | |
| `/admin/rotations` | `rotations` | |
| `/admin/reading-history` | `reading.history` | |
| `/admin/locutor` | `locutor` | |
| `/admin/youtube` | `youtube` | |
| `/admin/requests` | `requests` | |
| `/admin/prayer` | `prayer` | |
| `/admin/feedback` | `feedback` | |
| `/admin/devices` | `devices` | |
| `/admin/notification-programs` | `devices` | |
| `/admin/notices` | `notices` | |
| `/admin/settings` | `settings` | |
| `/admin/logs` | `logs` | |
| `/admin/jobs` | `jobs` | |
| `/admin/backups` | `jobs` | `superAdminOnly: true` |
| `/admin/users` | `users` | Effectively superadmin only |

`/admin/backups` is the one entry where the permission and the gate differ: it
declares `jobs` so it sorts with the operations group, but the nav hides it for
anyone who is not SUPERADMIN and the routes use `requireSuperAdmin`.

## Adding a permission

1. Add the key to `AdminPermission` and `ADMIN_PERMISSIONS` in
   `packages/types/src/admin.ts`.
2. Add the label to `ADMIN_PERMISSION_LABELS`.
3. Guard the route with `requirePermission("new.key")`.
4. Add the nav entry with the same key.
5. Existing `USER` rows need an explicit `PATCH /admin-api/users/:id`. `ADMIN`
   and `SUPERADMIN` derive it at runtime; nothing to migrate.

There is no migration to write, but there is a real consequence: a permission
added in step 1 is immediately available to every ADMIN, so make sure the
matching routes are guarded before deploying.

## Other credentials in the system

These are not panel permissions and are documented here so nobody confuses them
with RBAC:

| Credential | Header or channel | Protects |
| --- | --- | --- |
| Panel JWT | `Authorization: Bearer` | Everything under `/admin-api/*` except the webhook |
| Panel secret | `x-panel-secret` | `/panel-api/*`, the AzuraCast proxy for authenticated sessions |
| Webhook secret | `x-webhook-secret` | Facebook callbacks and the AzuraCast now-playing callback |
| Worker secret | `x-worker-secret`, or `secret` in the WS `register` message | Worker API, release download, job dispatch |
| SSE ticket | `?ticket=` query, single use | The prayer event stream, because `EventSource` cannot send headers |
| Device id | `deviceId` path param | The listener's own prayer requests |

The SSE ticket exists for one reason: `EventSource` cannot set an
`Authorization` header, so the panel fetches a short-lived ticket with its JWT
and the stream authenticates with the query parameter.
