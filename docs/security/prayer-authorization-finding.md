# Prayer Requests: Broken Object Level Authorization and Device Impersonation

- Date: 2026-09-22
- Status: Confirmed finding, remediation implemented (phases 0 to 3). See section 12 for the current state and what remains open.
- Severity: High (confidentiality breach on sensitive personal data)
- Category: OWASP API1:2023 Broken Object Level Authorization (BOLA), plus missing object-level authorization on device operations
- Affected area: `backend/src/modules/prayer/`, `backend/src/modules/devices/devices.routes.ts`, mobile prayer flow in `apps/mobile/`

## 1. Central thesis

The problem is not that the API uses public identifiers. The problem is that the API treats knowledge of those identifiers as proof of authorization.

An object identifier, even when it is a cryptographically unpredictable UUID, is not by itself a credential and is not proof of possession. `deviceId` is currently used as a de facto credential. That is the architectural flaw to fix.

The root-cause pattern is:

```typescript
if (!credential) {
  return resource;
}
```

Backward compatibility with old clients must never preserve an authorization bypass. A missing credential must deny access.

## 2. Scope and affected endpoints

### 2.1 Prayer history by device

`backend/src/modules/prayer/prayer.routes.ts:336`

```text
GET /api/prayer/my/:deviceId
```

This endpoint is public. It returns full rows including `name`, `request`, `respuesta`, and timestamps for every request linked to the supplied `deviceId`. There is no authentication and no proof that the caller owns that installation. Knowing or enumerating a `deviceId` exposes the complete history of that person.

Client usage:

- `apps/mobile/app/prayer-history.tsx:59`
- `apps/mobile/lib/device.ts:29` for `getDeviceId()`

### 2.2 Prayer detail by ID

`backend/src/modules/prayer/prayer.routes.ts:359`

```text
GET /api/prayer/:id
```

The handler allows unauthenticated access by ID for backward compatibility with app versions that do not send `deviceId`. If the caller supplies a `deviceId` via query or `x-device-id` header, ownership is checked. If the caller supplies nothing, the resource is returned. An attacker can therefore bypass the check by omitting the identifier.

Client usage:

- `apps/mobile/app/prayer/[id].tsx:36`

### 2.3 Mark as read by ID

`backend/src/modules/prayer/prayer.routes.ts:528`

```text
POST /api/prayer/:id/read
```

Same pattern as the detail endpoint. The ownership check only runs when the caller volunteers a `deviceId`. Omitting it falls through to the state-changing update.

### 2.4 Public device operations

`backend/src/modules/devices/devices.routes.ts:104`, `:156`, `:202`

```text
POST /api/devices
PUT /api/devices/:deviceId/token
PUT /api/devices/:deviceId/subscriptions
```

These endpoints accept a bare `deviceId` with no installation credential. Anyone who learns a `deviceId` can overwrite the `fcmToken`, hijack pastoral-response push notifications, or change subscriptions. Fixing prayer BOLA without fixing this leaves a device-impersonation path open.

The admin device endpoints under `backend/src/modules/devices/admin.routes.ts` require `requireAuth` plus the `devices` permission and are out of scope for this finding.

### 2.5 Creation endpoint

`backend/src/modules/prayer/prayer.routes.ts:75`

```text
POST /api/prayer
```

Creation itself is intentionally public for an anonymous radio audience, but it is relevant because it is where per-request credentials must be issued in the remediated design.

## 3. Findings in detail

### 3.1 BOLA on prayer objects

The combination that matters is object ID plus ineffective authorization plus sensitive data. The server permits access to an object based only on knowing its identifier. This matches OWASP API1:2023 Broken Object Level Authorization: authorization must be verified to confirm the requester is allowed to act on the requested object.

### 3.2 `deviceId` is an identifier, not a credential

`deviceId` is a stable per-installation identifier persisted in `AsyncStorage` (`apps/mobile/lib/device.ts:29`) and sent on every relevant call. It is used as if it were a password. It is not a password.

It appears in URLs, query strings, and headers. Even when production traffic uses HTTPS, as configured by default in `apps/mobile/constants/api.ts:5`, those locations still leak into server access logs (`morgan` in `backend/src/app.ts:60`), proxy logs, diagnostics, crash reports, and backups. Secrets must not be placed in URLs.

### 3.3 Note on `Math.random()` precision

`apps/mobile/lib/device.ts:10` generates the current `deviceId` with `Math.random()`. `Math.random()` is not a cryptographically secure pseudorandom number generator and must not be used to generate secrets or authorization factors. That statement is the defensible one.

It is too strong to claim without evidence that a remote attacker can reconstruct the current ID from a few samples. The issue is design misuse, not a demonstrated prediction attack. New secrets must use a CSPRNG such as `crypto.randomBytes()` on the server and `crypto.getRandomValues()` or `crypto.randomUUID()` from a secure source on the client.

### 3.4 Unpredictable UUIDs do not fix authorization

The prayer `id` and the `deviceId` must be analyzed separately. A correctly generated UUIDv4 may be unpredictable. That property does not authorize anyone. A server that returns an object to whoever knows its UUID still has BOLA. Unpredictability can raise the cost of enumeration, but it is not access control.

### 3.5 Transport wording

With HTTPS, request target and headers are encrypted on the wire by TLS. Saying the identifier travels in cleartext is incorrect for the production configuration. The accurate concern is persistence and exposure outside TLS: logs, history, referrers, analytics, and stored diagnostics. The remediation is therefore to keep bearer credentials out of URLs and out of logs, not only to rely on TLS.

### 3.6 Push notification exposure

`backend/src/modules/prayer/notification.service.ts:46` includes up to 140 characters of the pastoral response in the push body. Passing a payload through FCM does not make it publicly queryable in Firebase, so that stronger claim should not be made. The concrete risk is narrower and still real for a prayer app: sensitive text can appear on the lock screen, in notification history, in system logs, or in diagnostic mechanisms, without opening the app. The remediation is a generic body such as Has received a response to your prayer request, with details only inside the authenticated app view.

### 3.7 Internal email exposure

`backend/src/modules/prayer/prayer.routes.ts:113` sends the full prayer text by internal email. This expands the set of copies and recipients holding sensitive content. At minimum the recipient set must be minimal and controlled, delivery must use a trusted provider with TLS, and the design should consider whether the full body is needed or a link to the authenticated admin panel is enough.

### 3.8 Storage and observability gaps

- `backend/prisma/schema.prisma:376` stores `name` and `request` in plaintext. Disk and backup encryption is the baseline; application-layer field encryption is a separate decision with key-management cost.
- The backend has `helmet` and `cors` in `backend/src/app.ts:65`, but no request rate limiting was found. Unauthenticated read and creation endpoints are therefore enumerable without friction.
- Server-side length validation is missing. The mobile app limits name and request length in `apps/mobile/app/(tabs)/prayer.tsx`, but the backend only checks for non-empty strings. Length, content-type, and abuse controls belong on the server.
- Prayer content may end up in PM2 files, R2 backup bundles, and admin audit logs unless logging is explicitly scoped to exclude it.

## 4. Credential model

Use four distinct concepts. Do not let one value serve several roles.

| Value | Role | Authorizes | Storage |
|---|---|---|---|
| `deviceId` | Technical installation identifier | Nothing | Plaintext, relational key, metrics |
| `deviceSecret` | Installation credential | Device operations such as FCM token and subscription updates | Only `SHA-256` hash on server, bearer value in secure device storage |
| `prayerId` | Object identifier | Nothing | Plaintext UUID |
| `prayerToken` | Object credential | Exactly one prayer request | Only `SHA-256` hash on server, bearer value in app storage |

Conceptual diagram:

```text
                installation
  deviceId (identifier, never authorizes)
  deviceSecret (authorizes device operations)
                    |
            FCM token, subscriptions

                prayer request
  prayerId (identifier, never authorizes)
  prayerToken (authorizes that one request)
                    |
              PrayerRequest row
```

This isolates two different blast radii. Compromising a `prayerToken` exposes one prayer, not the whole history. Compromising a `deviceSecret` affects installation operations, not every prayer ever created on that device.

HMAC request signing was considered and rejected for this product. It would require canonicalization, timestamps, clock-skew tolerance, nonce handling, and replay protection. A random installation bearer plus a random per-request bearer over mandatory HTTPS provides the needed properties with far less complexity.

A multi-credential batch history endpoint was also considered and rejected for the initial design. Sending arrays of `{ id, token }` pairs would create a new sensitive surface requiring size limits, partial-response semantics, stricter rate limiting, and auditing, without a proven product need. Local history is a feature of the anonymous design, not a limitation.

## 5. Remediated API design

### 5.1 Issue credentials at creation

`POST /api/prayer` remains public but becomes the issuance point. The server generates a 256-bit token with a CSPRNG, stores only its hash, and returns the plaintext token once.

```typescript
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export function issuePrayerToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  return { token, tokenHash };
}

export function matchesPrayerToken(
  presented: string,
  storedHexHash: string | null,
): boolean {
  if (!storedHexHash) return false;
  const presentedHash = createHash("sha256").update(presented, "utf8").digest();
  const expectedHash = Buffer.from(storedHexHash, "hex");
  if (presentedHash.length !== expectedHash.length) return false;
  return timingSafeEqual(presentedHash, expectedHash);
}
```

SHA-256 over a 256-bit random token is appropriate here. This is not password hashing for low-entropy human secrets. The goal is to avoid storing a directly usable bearer in the database. Constant-time comparison over fixed-length hashes is a secondary defense. The primary property is that the token is bound to one object.

The Prisma change is additive:

```prisma
model PrayerRequest {
  id              String    @id @default(uuid())
  accessTokenHash String?   @map("access_token_hash")
  // ... existing fields
}
```

The mobile app stores the returned `{ id, token }` pair in secure device storage alongside its existing local state.

### 5.2 Authorize per object

```text
GET /api/prayer/:id
Authorization: Bearer <prayerToken>

POST /api/prayer/:id/read
Authorization: Bearer <prayerToken>
```

Behavior:

- Missing credential returns `401`.
- Nonexistent resource and incorrect token return the same `404` for `GET /:id`, so the endpoint does not act as an existence oracle for sensitive objects.
- `POST /:id/read` uses missing credential `401` and unauthorized or nonexistent `404`, documented explicitly.
- Bearer credentials travel only in the `Authorization` header, never in URLs, query strings, analytics, logs, or crash reports.

The `403` versus `404` choice is deliberate. `403` is semantically valid HTTP, but for sensitive prayer objects indistinguishability between not found and not authorized reduces enumeration value.

### 5.3 Device operations require the installation credential

```text
POST /api/devices
  -> creates deviceId and deviceSecret, returns deviceSecret once

PUT /api/devices/:deviceId/token
Authorization: Bearer <deviceSecret>

PUT /api/devices/:deviceId/subscriptions
Authorization: Bearer <deviceSecret>
```

The server stores only the hash of `deviceSecret`. The Prisma change is likewise additive with a nullable hash column during migration. Existing installations without a secret follow the legacy policy below, not a silent fallback to `deviceId`-only authorization.

### 5.4 History becomes local

`GET /api/prayer/my/:deviceId` is deprecated and removed. The app resolves history locally from stored `{ id, token }` pairs and fetches each entry with its own token. This is an explicit product consequence: uninstalling the app or losing local storage means losing access to anonymous history. That loss is the intended isolation property and must be communicated in UX copy rather than worked around with a global device credential.

### 5.5 Legacy records policy

Rows with a null credential hash are not accessible through the new public API. There must be no rule of the form token absent, therefore fall back to `deviceId`. Legacy prayers remain visible in the already-authorized admin panel, but public access requires either a controlled one-time reclaim flow with expiration or resubmission. Any reclaim mechanism must be specified, bounded, and auditable. An unbounded compatibility fallback would reintroduce the vulnerability being removed.

## 6. Transversal hardening

- Remove the unauthenticated fallback immediately, even before the token migration ships. Deny by default.
- Add rate limiting by IP on creation and on authenticated reads, with stricter handling for repeated `401` and `404` responses.
- Validate `name` and `request` length and shape on the server. Do not rely on mobile maxlength values.
- Replace sensitive push previews with a generic response-available message.
- Minimize internal prayer emails. Prefer a link to the authenticated admin panel over full-text copies where operations allow it.
- Exclude prayer text, tokens, and `deviceSecret` values from application logs, access logs, and error payloads.
- Define retention and deletion: automatic purge window, owner-initiated deletion authenticated by `prayerToken`, and documented backup behavior since SQLite dumps and R2 bundles contain these tables.
- Generate all new identifiers and secrets from a CSPRNG on both backend and mobile.
- Keep admin listing, moderation, status changes, and deletion behind the existing `requireAuth` plus `prayer` permission checks.

## 7. Compliance risk note

This section is a risk flag, not a legal conclusion, and requires review by qualified counsel.

Colombian Law 1581 of 2012 requires security measures to prevent unauthorized access, consultation, or use of personal data, and establishes principles of restricted access and circulation, security, and confidentiality. Prayer requests in a religious-organization app may reveal religious or philosophical convictions depending on content and inferences, which the law treats as a sensitive category. That raises the stakes of the current BOLA beyond ordinary identifiers.

Simplified statements such as consent is always required or deletion means immediate disappearance of every copy should be avoided. The statute has informed prior authorization as a general rule with exceptions, as well as specific conditions and procedures for suppression. The correct engineering posture is to record consent evidence already collected in the app, minimize sensitive content, restrict circulation, implement deletion and retention workflows, and submit the final wording and procedures for legal review.

## 8. Remediation plan

1. Phase zero: remove the missing-credential fallback in `GET /:id` and `POST /:id/read`, adopt the `401` and indistinguishable-`404` policy, and add rate limiting.
2. Phase one: add nullable `accessTokenHash` to `PrayerRequest`, issue tokens on creation, require them on detail and read endpoints, and remove `GET /my/:deviceId`.
3. Phase two: add nullable `deviceSecretHash` to `Device`, issue installation secrets, and require them for token and subscription updates.
4. Phase three: update mobile storage and UX copy, replace push preview text, review internal email content, and define retention and deletion behavior.
5. Phase four: specify legacy-record handling, backfill or reclaim policy, log redaction, and backup handling, then verify with the test matrix below.

## 9. Verification matrix

- Owner with correct `prayerToken` can read, mark as read and delete own prayer.
- `DELETE /api/prayer/:id/own` without the correct `prayerToken` returns `401` when no credential is sent and `404` when the credential is wrong.
- Caller with no credential receives `401` on protected prayer endpoints.
- Caller with incorrect token receives the same `404` as a nonexistent ID on `GET /:id`.
- Caller knowing only `deviceId` cannot list another installation history after removal of `GET /my/:deviceId`.
- Caller knowing only a prayer UUID cannot read it without its token.
- Caller knowing only `deviceId` cannot overwrite `fcmToken` or subscriptions without `deviceSecret`.
- Legacy rows with null hashes are inaccessible through the new public API.
- Admin with `prayer` permission retains listing, moderation, response, and deletion through authenticated admin routes.
- Rate limiting triggers on aggressive creation and enumeration attempts.
- Logs contain no prayer text, prayer tokens, or installation secrets.

## 10. Rejected alternatives

- Keep `deviceId` as authorization: rejected because it is a stable technical identifier exposed in URLs and diagnostics.
- Single global device credential for all prayers: rejected because one compromise would expose the entire history.
- HMAC-signed requests: rejected as unnecessary complexity for this threat model.
- Batch history endpoint accepting many tokens at once: deferred until a real product need justifies the added abuse surface.
- `403` for wrong token on sensitive detail endpoints: valid HTTP but weaker against existence enumeration than indistinguishable `404`.

## 11. References

- OWASP API Security Top 10, API1:2023 Broken Object Level Authorization.
- OWASP Session Management Cheat Sheet, guidance on identifiers and secrets in URLs, parameters, headers, and logs.
- Node.js `crypto.randomBytes()` documentation as the CSPRNG source for high-entropy tokens.
- Ley 1581 de 2012, Colombia, SUIN Juriscol, general regime on personal data protection and sensitive data categories.

## 12. Implementation status

Implemented on 2026-09-24 across backend, database and mobile app.

### Backend

- `backend/src/shared/utils/credentials.ts`: `issueCredential()` generates a 256-bit token with `randomBytes(32)` and returns `{ token, tokenHash }`; `matchesCredential()` compares the SHA-256 hash in constant time with `timingSafeEqual` and always denies when the stored hash is missing; `readBearerCredential()` reads the `Authorization` header.
- `backend/src/shared/middleware/rate-limit.ts`: dependency-free fixed-window limiter keyed by public client IP. Applied to prayer creation (20/min), prayer detail and read (60/min) and device writes (60/min). It is in-process, which matches the single-instance deployment.
- `PrayerRequest.accessTokenHash` and `Device.deviceSecretHash` added as nullable columns (migration `20260924000000_add_object_and_device_credentials`).
- `POST /api/prayer` issues the per-request token, stores only its hash and returns `accessToken` once. Server-side length validation now enforces 50 characters for `name` and 500 for `request`.
- `GET /api/prayer/:id` and `POST /api/prayer/:id/read` require a valid credential. Missing credential is `401`; wrong credential and nonexistent id share the same `404`. Admin sessions keep working through the existing JWT check.
- `GET /api/prayer/my/:deviceId` removed. `accessTokenHash` is excluded from the admin list payload.
- `POST /api/devices` issues the installation secret and returns it once. `PUT /api/devices/:deviceId/token` and `PUT /api/devices/:deviceId/subscriptions` require it. Missing device and invalid secret share the same `401` so `deviceId` alone is not an existence oracle.
- Prayer response push body is now generic; the response text is only shown inside the app. The FCM token is no longer written to logs.

### Legacy installations policy (the bounded claim)

A device row with a null `deviceSecretHash` may claim a secret on its first registration; after that the claim path is closed and the secret is required. This is a one-time bounded claim over a finite set of pre-existing rows, not an unbounded fallback to `deviceId`-only authorization. Prayer rows with a null `accessTokenHash` are not accessible through the public API at all.

### Mobile

- `expo-secure-store` and `expo-crypto` added. `apps/mobile/lib/secureStorage.ts` wraps the keystore with an AsyncStorage fallback for web builds only.
- `apps/mobile/lib/prayerCredentials.ts` stores one token per prayer in the keystore, with the non-secret ids indexed in AsyncStorage.
- The prayer history screen now resolves history locally and fetches each request with its own credential. Losing local storage means losing access to anonymous history; the copy in the empty state says so.
- `deviceId` is generated with `Crypto.randomUUID()`; the device secret is sent as a bearer credential on registration, FCM token updates and subscription syncs.

### Second pass: retention, deletion, email and logs

- Owner-initiated deletion: `DELETE /api/prayer/:id/own` requires `Authorization: Bearer <prayerToken>`. Missing credential is `401`; wrong credential and nonexistent id share the same `404`. The existing `DELETE /api/prayer/:id` stays admin-only and keeps the full session check (deactivation and token-version revocation), since deletion is destructive. The mobile detail screen offers a delete action with confirmation and prunes the local credential on success.
- Retention: `PRAYER_RETENTION_DAYS` (default `365`) and `PRAYER_PURGE_CRON` (default `30 4 * * *` in `TIMEZONE`) drive a daily purge. The purge deletes rows older than the window, including their credentials, and is disabled when the window is not positive.
- Internal email: the notification now contains only a link to the authenticated panel (`/admin/prayer`). No name and no prayer text leave the server by mail.
- Log redaction: `logger` recursively redacts `request`, `respuesta`, `accessToken`, `accessTokenHash`, `deviceSecret`, `deviceSecretHash`, `token`, `fcmToken`, `authorization` and `password` before writing any line, so prayer content and bearer values cannot reach PM2 files or the admin log viewer.

### Third pass: consent evidence and admin session reload

- Consent evidence: `POST /api/prayer` now requires `consentAccepted === true` and stores `consent_accepted_at` (stamped by the server, not the client clock) and `consent_version` from `PRAYER_CONSENT_VERSION` (migration `20260924100000_add_prayer_consent_evidence`). A submission without consent is rejected with `400`. Both the mobile prayer form and the web prayer dialog send the flag. The stored version must match the published `updatedAt` date of the data treatment policy; update `PRAYER_CONSENT_VERSION` when that document changes.
- Admin branch: `GET /api/prayer/:id` and `POST /api/prayer/:id/read` no longer accept JWT claims at face value. They call `resolveAdminSession` (the same user reload, active flag and token-version checks as `requireAuth`, plus the `prayer` permission), so a deactivated or revoked admin token is treated like any other caller without a valid credential.

### Still open

- Field-level encryption is not implemented; it is a separate decision with key-management cost. Disk and backup encryption remain the baseline. SQLite dumps and R2 backup bundles contain these tables, so those artifacts must stay encrypted at rest and access-restricted.
- No reclaim flow exists for legacy prayer rows (`accessTokenHash` null). Resubmission is the documented path; a reclaim flow would add abuse surface without a proven need.
- The public privacy texts still describe email delivery of prayer requests; the wording should be reviewed by counsel now that only a notification link is sent.
- No automated test suite exists, so the verification matrix was not executed as tests. Backend and mobile pass `tsc --noEmit` and the mobile project passes `eslint`.

### Environment variables added

- `PRAYER_RETENTION_DAYS`
- `PRAYER_PURGE_CRON`
- `PRAYER_CONSENT_VERSION`
