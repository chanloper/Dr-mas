# Dr.MAS mobile authentication API

Implementation prepared for review. Real MariaDB/HTTP validation has now been
performed in a new, disposable local instance only; no Cloudtype/production
connection, migration or deployment was performed. The existing mas_project web
server is unchanged. This package is a separate process and never imports it.

## API compatible with mobile/src/services/auth.ts

| Method | Path | Input | Success |
| --- | --- | --- | --- |
| POST | /auth/register | email, password, name, requestedRole | 201 `{ "accessToken": "..." }` |
| POST | /auth/login | email, password | 200 `{ "accessToken": "..." }` |
| GET | /auth/me | Authorization: Bearer token | 200 `{ "id": "...", "email": "...", "name": "...", "role": "patient" }` |
| POST | /auth/logout | Authorization: Bearer token | 204, revoke the presented token |

Responses and errors are JSON. Errors use `{ code, message }`: validation 422,
duplicate email 409, invalid credentials/token 401, unapproved guardian signup or
invalid account role 403, throttling 429, unavailable DB/missing schema 503.
Internal SQL and credentials are never returned or logged. No authentication
fallback exists if the database or schema is unavailable.

`requestedRole` is not a grant: the service creates only patient accounts.
Guardian signup returns `ROLE_APPROVAL_REQUIRED` and creates no account. Approved
existing guardian mappings can log in, and /auth/me reads the current role from
the DB on every request. No endpoint lets a client change roles, link a legacy
identity, or see another patient's records.

## Compatibility and data preservation

- Existing bcrypt hashes are verified with bcrypt.compare without rewriting them.
  New passwords use bcrypt cost 10, consistent with the legacy server.
- New registration writes Users + mobile identity + first session in one DML
  transaction. Failure, including a concurrent duplicate email, rolls back all
  three writes. Auto-increment gaps may remain after a rollback.
- New Users.login_id is an opaque `mob_` identifier (36 characters), not an assumed
  email. New names are limited to 30 Unicode code points to fit both known Users
  schemas. Age/gender remain NULL. Existing rows are not overwritten or merged.
- Mobile email is stored only in mobile_auth_accounts. It is ASCII, trimmed,
  lowercase and at most 254 characters. No Gmail-style dot/plus rewriting occurs.
  Legacy users require verified, operator-reviewed enrollment before email login;
  login_id values are never treated as verified emails.
- Login permits legacy short passwords when explicitly enrolled, but rejects
  NUL and passwords over bcrypt's 72 UTF-8-byte boundary to avoid silent truncation.
  Long legacy passwords need an approved password-reset flow, not rehash guessing.
- Access tokens are 32 random bytes (base64url). Only a SHA-256 digest is stored.
  They expire after one hour by default. Role is not embedded in the token.
  The stored credential fingerprint invalidates sessions when a web password
  change is observed. No JWT secret or refresh-token lifecycle is introduced.
- Mobile currently deletes its local token on logout; it does not call the
  optional server /auth/logout endpoint yet. A copied token remains usable until
  expiry or explicit server revocation. Refresh, password reset, email ownership
  verification, guardian approval, and patient-consent flows remain future work.

## Configuration (names only, no committed secrets)

Copy `.env.example` to a private `.env` only after approval. DB_HOST, DB_USER,
DB_PASS and DB_NAME are mandatory; no root account or database fallback is used.
DB_PORT defaults to 3306. MOBILE_API_HOST defaults to loopback,
MOBILE_API_PORT to 3001, and AUTH_TOKEN_TTL_SECONDS to 3600 (60–86400 allowed).
All DB parameters remain server-side. Unlike the existing web server, DB_NAME
and DB_PORT are actually consumed here.

No startup migrations exist. `npm start` is a future operator action: it creates
a real DB pool and opens a listener and must not be run before the DB/migration
and deployment approvals. Installing dependencies and running the tests below
does neither. No actual API URL has been selected; do not point the mobile app
at a guessed address. Once approved, its EXPO_PUBLIC_API_BASE_URL must resolve
to this API (including any proxy prefix).

## Offline verification

From this directory: `npm test` and `npm run check`. Tests use injected in-memory
repositories or fake connector objects, call handlers directly, and never open
a socket, instantiate a MariaDB pool, or execute SQL against a server. They do
not establish that migration SQL works against the actual MariaDB installation.

## Deployment work remaining (not performed)

Review [the additive migration](../database/migrations/README.md), test it against
an approved isolated database copy, and separately approve production changes.
Serve the API over HTTPS and protect DB transport with a private network or
verified TLS configuration appropriate to the deployment. Validate proxy routing
and trust-proxy rules: the default process trusts no forwarded IP headers.
The rate limiter is process-local; distributed limits and monitoring are needed
before multi-instance deployment. No public web CORS policy is enabled because
the current mobile SecureStore flow targets native apps.

## Explicit local MariaDB + HTTP validation

On Windows with MariaDB binaries already installed:

```powershell
npm.cmd run test:live -- --run-isolated-local --mariadb-bin 'C:\Program Files\MariaDB 12.2\bin'
```

Use the actual local binary directory. The runner refuses to proceed without the
explicit opt-in and existing binaries. It does not read .env, DB_* variables or
any remote URL, and never connects to the existing Windows MariaDB service.
It initializes a new ignored `.local-auth-tests/run-*` directory, generates
credentials in memory, binds DB and HTTP to loopback on temporary ports, verifies
the new server's data directory/port before DDL, and stops its own processes in
finally. It never installs a service or drops an existing database. Local test
artifacts are retained in the ignored directory; no secrets appear in results.

The test reproduces both Users definitions directly from the repository (without
executing schema.sql's reset statements or importing server.js). It tests the
actual migration, connector, repository, bcrypt, Express middleware and fetch
requests using an API account with limited table grants and fictional accounts.
It also checks concurrent duplicate registration, rollback, token digests, expiry,
revocation, foreign keys, malformed JSON and preservation of a seeded legacy row.

Result: MariaDB 12.2.2, 28/28 checks passed. This is not a compatibility assertion
for Cloudtype's unknown MariaDB version/configuration. See
[the detailed report](../docs/auth-http-mariadb-validation.md).

`node scripts/check-secret-files.cjs` performs a read-only heuristic secret audit
and emits file/rule/variable names only. It returns nonzero for review candidates;
it does not prove credential validity or scan Git history. Existing tracked
examples and the legacy server contain candidates that must be reviewed before
publishing. Adding ignore rules does not remove already-tracked content.

References: [bcrypt password byte limits](https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns),
[MariaDB Node.js Promise API](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/connector-nodejs-promise-api).
