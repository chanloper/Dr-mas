# Patient/guardian connections

Implemented with the existing local migration contract, without remote SQL or a
new migration. No live account operations or medical-data queries are performed
by the tests. The connection panel is in Settings for both authenticated roles;
Guardian Home and the Services connection card link to Settings. Existing tab navigation is retained.

- A patient shares their own account UUID privately with their guardian.
- A verified guardian enters that UUID and requests a connection.
- A patient sees pending requests and explicitly confirms approval or rejection.
- Both parties see approved connections and can revoke them. Guardians can also
  cancel pending requests. Other-user names/emails are not queried: profiles RLS
  only allows self reads, so the panel identifies counterpart accounts by UUID.
- Approval text explains read access to cloud medication schedules and records.
  It does not enable changes, location sharing, wearable monitoring or SOS alerts.

Existing RPC signatures:

| Action | RPC | Arguments | Result |
| --- | --- | --- | --- |
| Request | request_care_link | target_patient: uuid | uuid |
| Approve | approve_care_link | link_id: uuid | void |
| Reject/cancel/revoke | revoke_care_link | link_id: uuid | void |

There is no rejected enum or dedicated reject RPC. Rejection still uses revoked.
The reviewed reconnect SQL adds closure_reason (rejected/cancelled/revoked), keeps
legacy null reasons unknown, and permits a fresh pending row after termination.
It has NOT been applied to Dev by this mobile work.

Each first-page/refresh SELECT requests closure_reason. Only the known missing
column codes 42703/PGRST204 fall back to legacy fields and disable retries. Other
errors fail closed. A successful column SELECT is the read-only schema signal
for the known atomic reconnect migration; no client flag, admin query or write
probe is used. It does not independently attest the partial index/RPC body. An
inconsistent/manual partial schema deployment remains a server configuration
problem: fresh pair checks and the authoritative RPC still reject unsupported or
duplicate operations, without deleting history or reactivating old IDs. A separately
approved deployed-contract/JWT test remains necessary before claiming live success.

Before every request, participant-filtered, pair-specific reads check for active
pending/approved rows (even outside loaded pages), then terminal history. Retry
requires the schema signal rechecked at action time; legacy servers reject it
locally with UNSUPPORTED. New targets may still be requested on the legacy schema.
Auth identity is reverified before RPC. Concurrent RPC races are resolved by server
uniqueness; the app never retries mutations automatically. A retry success means
only request accepted, not permission to read medications: fresh patient consent
is still required. Reapproval always uses the new request ID.

The panel separates loaded pending, approved and historical rows, shows source
closure reasons and dates, and never guesses a legacy reason. Only the latest
loaded terminal row per patient offers a confirmed retry, only to guardians and
only without a loaded active relationship. Repository checks catch unloaded active
relationships. Unknown schema support hides retry actions. The visible counts
are explicitly loaded counts, not claimed totals.

The service checks the current Auth user, validates UUIDs/participant membership,
and re-reads link state before a mutation. RPC-side checks and RLS are authoritative;
client checks are additional UX protections. Auth, duplicate, self, invalid target,
stale state, network and server failures use static messages. The API deliberately
does not distinguish nonexistent and inaccessible targets, avoiding account
enumeration. Writes are not automatically retried. After an uncertain result,
actions stop until the user refreshes the list. The hook and repository serialize
mutations; duplicate taps do not issue a second RPC.

Lists use 25-row keyset pages, ordered created_at DESC, id DESC, with a 26th lookahead
and exact filtered count. Timestamp/UUID cursor inputs are sanitized before the
PostgREST OR expression, microsecond precision is preserved, duplicate/out-of-order
rows are rejected, and unexpected server row caps fail rather than silently hiding
records. A new row ahead of the cursor appears on refresh. Status changes on old
rows also require refresh; keyset pagination is not a cross-request DB snapshot.
Load-more is single-flight and appends by ID; auth/network failures clear actions
and data until refresh. Server capability changes mid-pagination also require
refresh. At 500 loaded rows the UI stops loading with an explicit message; it does
not claim all rows are shown. Pair checks never rely on this capped local list.
Successful mutations reset pagination to page one; no ID list is persisted.

Account switches, sign-out/unmount and stale async responses are guarded. The
panel refreshes on foreground and on request, approval or revocation. It caches no
data on disk. Registered RAG data, login flow and medication implementation are
unchanged. A guardian cloud-medication viewing screen is not implemented here.

Prerequisites for a later approved Dev test: provision synthetic patient A/B and
an approved guardian role through a trusted existing admin process. The current
signup flow creates patients; this feature never grants guardian roles itself.
Confirm deployed RPC/schema parity first; local code does not prove live parity.

RLS review checks that can_read_patient requires an approved connection with a
current guardian role and patient target; both medication SELECT policies use it.
Unit tests verify the exact RPC calls, role gates, recipient filters, errors and
confirmation UI. They are not a PostgreSQL RLS engine. Actual A/B isolation,
pending denial, approval allowance and post-revocation denial with real user JWTs
remain unverified and require a separately approved Dev test with synthetic data.
Do not use service_role/admin queries as proof of user RLS enforcement.

Mock regression cases cover legacy schema, null/invalid closure reasons, retry with
new ID/reapproval/stale IDs, active pairs on unloaded pages, 126 same-timestamp
records, microseconds, inserts ahead of the cursor, exact-count row-cap mismatch,
duplicate mutation/load taps, auth expiration, account switching, schema downgrade,
and history UI role/capability gates. No remote SQL/RPC or real accounts are used.
