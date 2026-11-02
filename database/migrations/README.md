# Mobile authentication migration (not applied)

`001_mobile_auth.sql` is a review artifact. No migration runner, server startup
hook, or automatic backfill is provided. Do not run `database/schema.sql` or
`mas_project/server.js` as a migration procedure: they contain destructive reset
or runtime DDL behavior respectively.

## What the migration adds

- `mobile_auth_accounts`: one explicitly enrolled mobile identity per legacy
  `Users.user_id`; unique normalized email and a server-owned role.
- `mobile_auth_sessions`: SHA-256 digests of random access tokens, credential
  fingerprints and UTC expiry. No raw tokens or plaintext passwords are stored.
- Foreign keys restrict deletion/update; there are no cascade deletes.

There is no ALTER, DROP, TRUNCATE, UPDATE, DELETE, automatic role assignment to
existing users, password rehash, or email inference in the migration. Existing
`Users`, `Facilities`, symptom logs, contacts and alerts remain untouched.

## Review before any approved execution

1. Confirm the actual target database and take a restorable, verified backup.
2. Compare the live `Users` definition to both repository definitions. It must
   use InnoDB with signed INT `user_id` as its primary key, and the expected
   `login_id`, `password`, `username`, nullable `age`/`gender` columns. Review any
   existing triggers and additional required columns before enabling API writes.
3. Confirm the two new names and constraint names are unused, the target MariaDB
   version supports the SQL, and DB/session timezones and charset are understood.
4. Review foreign-key metadata locks against the production workload. Restrict
   the runtime API account to SELECT/INSERT on Users, SELECT/INSERT on
   mobile_auth_accounts, and SELECT/INSERT/DELETE on mobile_auth_sessions. Keep
   migration/role-administration privileges out of the runtime account.
5. Apply and validate in an isolated copy first, with explicit approval. Check
   existing row counts and password hashes remain unchanged and exercise the API
   registration transaction, duplicate-email rollback and session expiry.
6. Only after separate production approval, apply the reviewed file using a
   migration operator and the explicitly selected database. Record its checksum,
   execution status and deployment version outside the API runtime.

MariaDB DDL implicitly commits. These CREATE statements are not atomic as a
group: if the second fails, the first may remain. There is deliberately no
`IF NOT EXISTS` to hide schema drift, and no automatic retry or destructive down
script. Inspect partial application, preserve any new data and make a reviewed
recovery plan rather than rerunning the file or dropping tables.

## Existing account enrollment and roles

Existing users are not mobile-enrolled automatically. Before inserting a mapping,
an authorized process must verify ownership of the legacy account AND the email,
normalize the email using the API policy, resolve duplicates, and choose the
server-approved role. Preserve the existing user_id, login_id and bcrypt hash.
The API does not provide an administrative enrollment or role-change endpoint.

Patient self-registration is supported. Guardian self-registration is rejected
with 403 until an approval/invitation process is specified. An approved guardian
must have an explicitly reviewed mobile_auth_accounts mapping with role guardian;
this role alone does not grant access to another patient's records. Patient
consent and family relationships require a separate design/migration.

## Rollback and operations

An application rollback can stop routing requests to the new API while retaining
the additive tables. Do not delete shared Users rows or mobile mappings to roll
back a deployment. New accounts created after rollout must be preserved too.
Expired sessions need an approved retention/cleanup job; none runs automatically.

References: [MariaDB CREATE TABLE](https://mariadb.com/docs/server/server-usage/tables/create-table),
[Connector connection options](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/node-js-connection-options).
