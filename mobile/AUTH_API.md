# Mobile authentication API contract

Superseded as the app default by Supabase on 2026-11-01. This document describes
the preserved legacy adapter (`src/services/auth.mariadb.ts`) and mobile-api only.
The app does not automatically fall back to it. See ../docs/supabase-transition.md
for current configuration, session storage, profiles and permissions.

Status: compatible backend source is prepared in ../mobile-api. Database
migration, legacy enrollment, server execution, deployment and an actual URL
remain pending; no live API connection has been verified.
The existing `mas_project/server.js` uses loginId and cookie sessions, does not
provide the token + email + account role contract below, and was not changed.

Set `EXPO_PUBLIC_API_BASE_URL` in mobile/.env to the actual backend base URL
(including any API prefix), then restart Expo. Missing configuration fails
explicitly; the application has no fallback address or simulated success.
Production requires HTTPS; development builds may use HTTP.

## Endpoints

All requests/responses use JSON. Paths below are appended to the configured base.

| Method | Path | Request | Success response |
| --- | --- | --- | --- |
| POST | /auth/register | `{ "email": "...", "password": "...", "name": "...", "requestedRole": "patient" }` | 201 `{ "accessToken": "..." }` |
| POST | /auth/login | `{ "email": "...", "password": "..." }` | 200 `{ "accessToken": "..." }` |
| GET | /auth/me | Authorization: Bearer accessToken | 200 `{ "id": "...", "email": "...", "name": "...", "role": "patient" }` |

Roles are exactly `patient` or `guardian`. `requestedRole` is a registration
request, never an authorization grant. The server must validate eligibility,
store the account role, and enforce role and patient-sharing authorization on
every protected endpoint. Login does not send the selected role. The client
always calls /auth/me before opening a home screen, including after registration.
Registration must return an active token for this contract. If email verification
is required, its pending state and verification endpoints need to be agreed first.
The prepared backend permits patient self-registration only. Guardian signup
returns 403 ROLE_APPROVAL_REQUIRED until a verified approval process exists.
Previously approved guardian accounts use the same login and /auth/me endpoints.

## Errors and sessions

- 409: duplicate email.
- 401: invalid credentials, expired/revoked token. 403: disallowed account/access.
- 400/422: invalid input; 429: rate limit; 5xx: backend failure.
- Optional error body: `{ "code": "...", "message": "..." }`.
  The client shows its own safe messages rather than raw server output.
- Requests time out after 15 seconds. Malformed success responses fail closed.
- Only the access token is stored in Expo SecureStore; passwords and cached roles
  are not persisted. Unsupported platforms (including web) fail explicitly.
- Startup verifies the stored token through /auth/me. On network/configuration
  failure the token is retained but the dashboard stays locked. On 401/403 it is
  deleted. The login form permits retrying after service recovery.
- Logout locks the dashboard and deletes SecureStore data. Deletion failure is
  displayed with a retry action and is not reported as a completed logout.
- No refresh-token contract exists yet. Expired tokens require login again.
  The backend provides optional POST /auth/logout (Bearer token, 204), but the
  current mobile logout deletes its local token only. Calling server revocation
  from the mobile app and refresh rotation remain follow-up work.
- Medication records retain their existing device/day storage behavior. They are
  not server patient records or account-scoped data; backend synchronization and
  account-scoped migration require a separate contract.

## Remaining integration validation

Deploy the endpoints, set the URL, then verify registration, duplicate email,
invalid credentials, server-selected roles, restart, expired tokens, offline
startup, and logout on iOS/Android. Rebuild the native app after adding SecureStore.
Do not use the existing web session endpoints as substitutes for this contract.
