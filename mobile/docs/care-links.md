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

There is no rejected enum or dedicated reject RPC. Rejection of a pending request
uses the existing revoked state. The unique patient/guardian pair and request RPC
do not support requesting again after rejection/revocation. The UI discloses this;
no automatic resurrection or direct table mutation is attempted. Supporting a
separate rejection history/re-request would require a separately reviewed DB
change; no such change is included or executed.

The service checks the current Auth user, validates UUIDs/participant membership,
and re-reads link state before a mutation. RPC-side checks and RLS are authoritative;
client checks are additional UX protections. Auth, duplicate, self, invalid target,
stale state, network and server failures use static messages. The API deliberately
does not distinguish nonexistent and inaccessible targets, avoiding account
enumeration. Writes are not automatically retried. After an uncertain result,
actions stop until the user refreshes the list. Lists over 100 records fail with
an explicit limit message rather than silently claiming to show every connection.

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
