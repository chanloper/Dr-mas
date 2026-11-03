# Care-link re-request proposal — NOT APPLIED TO DEV

The original UI is preserved in a separate local commit. These proposal files
are intentionally outside migrations/. They are not ready to auto-run against
DrMAS-Dev. The user reports successful execution in an isolated PostgreSQL 17.11
database; see [results and Dev readiness](reconnect-dev-readiness.md) for evidence
limits, the missing session A output and remaining deployment gates.

Root cause: the original UNIQUE(patient_id, guardian_id) covers revoked rows;
request_care_link always INSERTs. reject/cancel/revoke retain the old row, so a
later request conflicts even though it is no longer approved.

## Proposed minimal change with history preservation

Keep the existing pending/approved/revoked enum and all existing rows/IDs. Add a
nullable closure_reason column and CHECK. Existing revoked rows keep NULL and
are presented as an unknown legacy reason, never guessed as rejection.

| Prior state | Actor/action | State | closure_reason |
| --- | --- | --- | --- |
| pending | patient rejects | revoked | rejected |
| pending | guardian cancels | revoked | cancelled |
| approved | either participant disconnects | revoked | revoked |
| revoked | guardian requests again | new pending row | NULL |

Old approval metadata is retained on the old row. New requests have fresh UUIDs,
NULL approval metadata and require fresh patient consent. Replace the full-pair
UNIQUE constraint with a partial unique index over pending/approved only. Existing
approved connections are not modified. Concurrent requests can create at most one
active row; losers receive 23505. ON CONFLICT never updates an existing row.

revoke_care_link locks the participant's row before classifying the terminal
transition. The existing approval RPC uses a conditional pending UPDATE, which
also locks/rechecks a concurrently changed row. Approving an old ID cannot approve
a new request. The original participant SELECT policy and medication read policy
continue to require caller participation and an approved relationship respectively.
No table-write privileges, anonymous grants or new user lookup are introduced.

## Validation performed and limitations

Node tests characterize the old failure and independently exercise synthetic
state-machine invariants, history, duplicate scheduling and participant boundaries.
Static tests inspect the SQL's security/constraint contract. They do NOT parse or
execute PostgreSQL, execute RPCs, or establish live RLS/concurrency correctness.
User-reported real-engine results are recorded separately from these Node tests.
Session A evidence, cleanup confirmation and deployed-schema/JWT checks remain
required before Dev application can be approved.

## Required checks before a future approved Dev change

1. Compare deployed table/enum/constraints/indexes, all function bodies/owners,
   role memberships and RLS against the initial migration. The draft fails on an
   unexpected old constraint name or RLS baseline. Review extra unique indexes
   and any FK depending on the old pair constraint; never use CASCADE to bypass.
2. Preserve a schema/data backup and obtain explicit approval for the exact SQL.
   The access-exclusive lock needs a maintenance window; 5s lock and 60s statement
   timeouts fail rather than waiting indefinitely. Migration is transactional.
3. Test existing approved/pending/legacy-revoked fixtures; no row/ID/approval loss.
   Test simultaneous same-pair requests, approve vs close, close vs re-request,
   old-ID replay and unrelated pairs in two real sessions.
4. With non-admin synthetic A/B/G JWTs, test pending denial, new approval allowance,
   rejection/revocation denial, re-request still denied until approval, and inability
   to list/mutate another pair. Admin success is not RLS proof.
5. Only after that, promote the reviewed draft into migrations with explicit user
   approval. Do not rerun the initial migration. Review catalog baseline tooling:
   care_links adds 1 column and 1 CHECK; the pair UNIQUE constraint is removed and
   replaced by a partial unique index. The current comparator reads only the initial
   migration; its inventory/reference must be deliberately updated, not bypassed.
6. Update the mobile warning that re-request is unsupported, add closure_reason
   presentation and pagination for retained history, and test the deployed contract.
   Current mobile behavior stays compatible with the original, unapplied schema.

Re-request after a rejection can create unwanted repeated notifications. Define
cooldown/blocking/consent-abuse requirements before public release; this draft does
not implement a rate limiter or notification system. A rollback after new history
exists cannot blindly restore the full UNIQUE constraint; preserve rows and use a
reviewed forward fix. Never delete history to force a rollback.

References: https://www.postgresql.org/docs/17/indexes-partial.html and
https://www.postgresql.org/docs/17/sql-insert.html
