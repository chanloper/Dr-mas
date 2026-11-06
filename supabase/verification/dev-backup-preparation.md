# Dev reconnect preparation — no migration authorization

## Resume an existing successful dump (implementation prepared, not run remotely)

The original database.dump, .sha256, pg_dump-exit.txt, before.private.json, original
logs and empty after-backup.private.json are read-only inputs. Resume never invokes
pg_dump. New files are exclusively created in a NEW resume-timestamp-GUID child
folder; prior attempts/results are not overwritten.

```powershell
$prep = 'C:\MAS\Dr-mas\supabase\verification\prepare-dev-backup.ps1'
$backup = 'V:\DrMAS-Dev-pre-reconnect-20261104-183402-1f3168a8'
# Local existing-exit/checksum/before-format checks only. No remote access.
& $prep -Resume -BackupDirectory $backup
# ONLY after explicit approval for one new Dev read-only verification:
& $prep -Resume -BackupDirectory $backup -Execute
```

The second command prompts for the approved Dev connection/CA locally and requires
the exact confirmation RESUME-READONLY-DEV BEFORE invoking psql. Password is a
native hidden prompt, never an argument/environment/file. It rechecks original
exit 0 and checksum, runs pg_restore list/full-read without a database argument,
then rechecks the input files before a single read-only preservation query.
It imports only the native bridge functions, never runs the offline restore script.
No backup/restore, migration or application-account mutation can occur in Resume.

New query-result.private.json contains aggregate metadata/fingerprints only.
query-status.private.json records the actual native exit (null if unobserved),
ExitObserved and a fixed diagnostic category. Raw stderr is never recorded/printed.
Categories AUTH/TLS/CONNECT_TIMEOUT/CONNECTIVITY/SQL_TIMEOUT/SQL_PERMISSION/
SQL_OR_CONNECTION_ERROR/OUTPUT_IO/NATIVE_START/UNKNOWN are conservative hints, not
a complete root-cause proof. Successful uncategorized stderr yields NONE with exit 0.
If exit is 0 but JSON/required fields are invalid, a new validation-status file
records INVALID_RESULT; this is still a failed verification. No existing status
is replaced. If disk/output creation itself fails, recording may be impossible;
the safe stage message is the only available evidence, and no PASS is emitted.

Only the original before and NEW current observations are compared. Ordering of
JSON properties/fingerprint collections is irrelevant. A changed observation
produces exit 2 and a private comparison report: BACKUP_CHECKS_PASS but later
writes/schema changes may explain the difference. Do not call this backup failure
or automatically take another dump. Exit 0 means this resumed comparison matched,
NOT proof of the immediate post-backup state. That lost point in time cannot be
reconstructed by the new query, even if it matches. Real restoration remains
unverified/deferred and Dev migration requires separate approval.

All tests for this feature use temporary synthetic files/processes and mocked
query results. No original V: artifact or remote endpoint is used by the tests.

The previous encrypted backup and its checksum remain untouched. Actual restoration
is unverified and deferred by the project owner. Archive read/hash PASS does not
prove recovery. This tool creates a NEW timestamped/GUID folder on V: only.

## User-operated connection/backup

No remote connection has been made by authoring or testing this tool. There is no
stored DB password or authorized Supabase connector available to the agent. The
current Dev state and latest backup require the user's interactive local execution.

In a fresh local PowerShell console (no transcript/recording), mount/confirm the
encrypted V: in VeraCrypt. Leave enough space for a new backup; the tool requires
64MiB free for this small backup, NOT a lower restore-cluster space threshold.
Select DrMAS-Dev/main in Dashboard Connect. Use Direct connection when reachable,
otherwise Session pooler on port 5432; no transaction pooler. Obtain the official
project CA from Database Settings. Do not input a password-bearing URL.

```powershell
$prep = 'C:\MAS\Dr-mas\supabase\verification\prepare-dev-backup.ps1'
# No network: verifies only the approved migration file hash.
& $prep
# User-approved read-only Dev checks and NEW backup only, NEVER migration.
& $prep -Execute
```

Enter project reference, hostname, DB username and CA path locally. Passwords
are native hidden prompts only. TLS is verify-full. Only fixed safe prompt text
reaches the console; raw stderr is discarded. No password/environment-file loading
or SQL mutation occurs. Connection targeting is checked against the entered project
reference, so the user must independently ensure that reference is DrMAS-Dev/main.
The preserved archive may contain Auth password hashes/tokens and medical records:
never print/open/upload the dump or private JSON/logs into chat/Git/external AI.

Steps: read-only Dev baseline + aggregate core fingerprints -> pg_dump -> record
actual exit code -> SHA-256 -> TOC read -> full archive read to NUL -> read-only
after-backup fingerprints -> private preparation report. Existing archive/package
is not overwritten. Failure stops with a safe stage; partial new files are retained,
not considered a successful backup. Native stderr warnings are not independently
audited by this filter, so exit/structure PASS is not full completeness/recovery proof.

If source fingerprints change during backup, stop and arrange a quiet write window
before retrying in a NEW folder. Matching before/after observations do not lock out
other writers. Backup uses pg_dump's own consistent snapshot; there is no exported
shared snapshot with the separate checks. Do not infer continuing source stability
after this run, or a guarantee against transient changes that reverted between checks.

## Application-time preservation plan, separate approval required

1. Confirm latest preparation report and review archive/private results locally.
   Stop app/automation writes during the maintenance window. If any write occurred
   since backup, take another backup with recorded exit 0 before deciding to apply.
2. Immediately BEFORE applying, rerun reconnect-data-preservation-readonly.sql to
   a NEW private file. Archive the current definitions/ACL/catalog with the already
   reviewed tools if needed; do not overwrite prior evidence. This is data checking,
   not a demand to repeat the completed source/static review.
3. Approve ONLY the exact migration path/hash, project and branch, trusted owner,
   maintenance window and acknowledged unverified-restoration risk. The preparation
   tool NEVER executes the migration even after a preparation PASS.
4. In a later separately approved phase, apply the entire SQL transaction once.
   Error before COMMIT means ROLLBACK and stop. Do not blindly rerun fragments.
5. Immediately AFTER COMMIT, before any synthetic writes, run the same preservation
   SQL into another new private file. Compare each table's count+fingerprint and
   status counts, excluding only the newly added closure_reason field. Changes
   must be investigated; do not automatically label them migration data loss if
   another writer was active. No row IDs/content/per-row hashes are returned.
6. Expected metadata: old pair UNIQUE count 0, new index present and valid/unique,
   correct pending/approved predicate, closure_reason column/CHECK present, existing
   closure_reason values NULL, all 4 RLS flags/11 policies and grants retained.
   Verify request/revoke definitions against the approved SQL and unchanged approve
   contract. Column presence alone is insufficient deployment proof.
7. Separate ordinary synthetic A/B/G/H JWT tests verify approval and renewed consent,
   unrelated-user denial, revoked/pending read denial and duplicate/old-ID denial.
   Admin SELECT success is not JWT/RLS evidence. Synthetic account/data writes need
   explicit authorization; they are not part of this backup script.

After COMMIT, stop new connection writes if problems occur; preserve history and
use a reviewed forward fix. Do not drop new history to re-add full UNIQUE or restore
only the old revoke RPC (it may conflict with closure_reason CHECK). Full backup
restore would itself be a destructive operation requiring separate approval and
has not been proven. No automated rollback/restore is included.
