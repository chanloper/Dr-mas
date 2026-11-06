# Dr.MAS core partial restore package — PREPARED, NOT EXECUTED

## Single offline PowerShell runner (prepared, not executed)

`run-offline-restore.ps1` consolidates steps B/C and shutdown below. It does not
prepare/overwrite the existing private package. It runs read-only preflight by
default. `-Execute` additionally requires the exact local confirmation phrase.
No approval for actual restore is implied by this script's existence.

Before going offline, keep this README/script accessible locally. Mount V: with
VeraCrypt, confirm its container in the VeraCrypt GUI and keep it mounted. Stop
PowerShell transcripts/screen recording and use an interactive, local console.
Do not copy passwords into scripts, environment variables or files.

The runner verifies QueryDosDevice('V:') points to a VeraCryptVolume device AND
the VeraCrypt Windows driver is running. A label, installed EXE or user statement
alone is not accepted. If device naming/permissions differ, it fails; inspect
locally rather than bypassing the check. No VeraCrypt mount/unmount occurs.
It reports capacity/free bytes and requires max(2GiB, 20*packageBytes+1GiB), with
a 512MiB reserve at step boundaries. This is conservative, not a guarantee against
growth during a statement; disk-full is a failed run, never a partial PASS.

After separate approval, disconnect external adapters/VPN/uplinks as described
below. The runner accepts only UP loopback interfaces. Thus an UP isolated virtual
adapter can also block it deliberately. It checks before/after native steps, but
is NOT a continuous firewall: keep adapters physically disconnected/disabled for
the entire run. Reconnecting mid-statement can defeat isolation before detection.

From a fresh Windows PowerShell console, run these AFTER network disconnection:

```powershell
$runner = 'C:\MAS\Dr-mas\supabase\verification\core-restore-package\run-offline-restore.ps1'
# Read-only checks; no cluster or DB is created.
& $runner
# ONLY after explicit user approval. Enter confirmation phrase when requested.
& $runner -Execute
```

If execution policy prevents local scripts, inspect/review the policy and obtain
approval for any change; do not silently use Bypass or change machine policy.
Network adapter/firewall changes may need administrator approval. initdb/pg_ctl
run in the ordinary user's account with V: permissions; no Windows service is
created or changed. CIM/device status checks may be restricted: failure blocks
execution rather than triggering elevation. Passwords are native -W prompts only.

Only fixed 55433/new V: paths are writable targets. Preflight refuses a preexisting
cluster, occupied port or prior run outputs. Captures the existing PostgreSQL
service/55432 listener state and compares it after verification; normal concurrent
changes may conservatively fail this comparison. It never stops the 55432 service.

The finally block attempts fast, waiting shutdown of ONLY the new -D path and checks
its PID file, tracked postmaster/child processes and 55433 listeners. Any uncertainty
prints KEEP_NETWORK_OFFLINE_AND_V_MOUNTED. Do not reconnect or dismount V: then.
If the console is forcibly closed/power is lost, finally is not guaranteed: keep
offline and use the explicit pg_ctl stop command below; locally confirm no 55433
listener, no postmaster.pid and no surviving cluster processes before reconnecting.
No deletion/reset/automatic retry is performed. Preserve failed artifacts.

All stdout stays in new private V: logs (counts/stages only for SQL). A native
process bridge consumes stderr character-by-character: only recognized English
password prompts produce a fixed `Local password (hidden input)` message. Every
other stderr character is discarded, never displayed or saved, even on shutdown.
LC_ALL/LANG are set to C for these child processes. Password input remains native
hidden console input and is not redirected/captured; interactive PostgreSQL prompt
behavior still needs the future approved offline run, not a synthetic PASS claim.
Unknown/localized prompts or stalled input require stopping the run and checking
locally; never redirect raw stderr to the console or weaken the filter.
Do not share PostgreSQL server logs: failures can contain statements/data privately.
The script emits a final PARTIAL PASS only after SQL checks, metadata parity and
shutdown succeed. Full Supabase/Auth/JWT recovery remains UNVERIFIED.

Shutdown tracks `$trackedProcessId` explicitly. `$id` and `$PID` are distinct names
in PowerShell; the rename removes ambiguity. Shutdown's local assignment/loop names
are checked for automatic-variable collisions. Synthetic tests cover successful
stop, nonzero stop exit, residual listener/PID file/process and failed process
inspection; every uncertain case remains STOP_UNCONFIRMED and forbids reconnect.

No DB access, cluster creation, firewall change or restore is performed by preparing
this package. The existing 55432 cluster, Dev and original archive remain untouched.
This is a CORE DATA partial restore with an Auth surrogate, never full Supabase recovery.
The original pg_dump exit code remains unknown.

## Scope and constraints

`selection.cjs` derives an exact private TOC list from pg_restore --list, checks
required object counts and rejects missing items. Includes four public tables and
their data, two enums, six keys/eight FKs, five explicit indexes, eight functions,
three app triggers (including auth.users signup), eleven policies, RLS flags,
table/column/function ACL and private-schema ACL. Table CHECKs reside in table DDL.
Preserves postgres ownership, SECURITY DEFINER and function configuration.

Excluded: all managed Auth definitions/data, Storage/Realtime/Vault/extension
objects, networking functions, event triggers, unrelated public functions, global
roles/passwords, database settings, public schema ACL and DEFAULT ACL. These last
two are deliberately replaced by restrictive local setup, not claimed identical.
Private excluded.list records every excluded TOC item; never publish that file.

Minimal auth.users stores only profile-referenced UUIDs and empty metadata.
No emails, password hashes, tokens, identities or sessions are extracted.
UUIDs are still sensitive. They are read in memory from profiles COPY, kept inside
V: and never printed. Auth users with no profiles are outside this test scope.
The real auth.uid() is replaced by a local subject-setting surrogate. The signup
trigger is restored AFTER Auth stubs and profile data, avoiding automatic duplicate
profiles. Actual Auth login, JWT signature/expiry and account recovery are unverified.

## Approval gates and isolation

User approval is REQUIRED before cluster initialization/start, DB/role creation,
firewall changes and actual restore. No installers, Docker or VM are needed for
this restricted core schema. Existing initdb/pg_ctl/createdb tools suffice.

Use a NEW cluster on 127.0.0.1:55433 and DB drmas_core_restore_verify. Use V: for
cluster data, generated SQL and sensitive comparison artifacts; protect V: and its
contents with filesystem permissions where supported. V: must remain mounted
while the cluster runs. Do not permit concurrent source schema/data changes to be
mistaken for parity; the expected catalog is the reviewed pre-reconnect Dev snapshot.

LOCALHOST IS NOT AN OUTBOUND FIREWALL. Before loading data, disconnect all external
network adapters (including VPN, Wi-Fi, Ethernet) and verify no other host adapter
or route provides egress; keep loopback. Do this only with explicit user approval
because it interrupts this chat and other apps. The user performs the offline steps
locally and reconnects only AFTER postgres on 55433 is stopped. Alternatively use a
reviewed isolated VM; that is a separate installation plan. If complete egress
isolation cannot be established, STOP. Binding to 127.0.0.1 alone is insufficient.
Source selection also excludes network/event executables but is no replacement
for isolation. No commands below alter networking automatically.

Before the offline restore, inspect `Get-NetAdapter -IncludeHidden` and
`Get-NetRoute -AddressFamily IPv4` / `Get-NetRoute -AddressFamily IPv6` locally.
All non-loopback paths (including VPN/virtual adapters with an uplink) must be
disabled or demonstrably isolated; absence of a default route alone does not
block same-subnet traffic. Do not upload adapter/route output. If verification
requires administrator rights, obtain approval; do not assume isolation on errors.

## A. Offline file preparation only (no DB connection)

Run at C:\MAS\Dr-mas. Parent V:\ must be mounted/private. Output folder must NOT
exist. Do not overwrite prior packages. This step reads actual profile/medication
data into memory/private V: files; no raw contents are printed or sent externally.

```powershell
$tools = 'C:\MAS\Dr-mas\supabase\verification\core-restore-package'
$private = 'V:\DrMAS-CoreRestore-Package-20261104'
node "$tools\prepare.cjs" `
  'V:\DrMAS-Dev-20261104-165001.dump' $private `
  'C:\DrMAS-LocalTest\dev-full-catalog-20261104.json'
if ($LASTEXITCODE -ne 0) { throw 'Preparation failed; do not execute partial files' }
node "$tools\verify.cjs" $private before
if ($LASTEXITCODE -ne 0) { throw 'Package hashes failed' }
```

Expected catalog must be the verified full drmas-p1-catalog-v1 snapshot. It is
not an independent initial-SQL reference. If snapshot and archive differ, final
parity fails; investigate, never weaken the checks. Selected/excluded lists,
restore SQL, manifest, expected catalog and export SQL are private artifacts on
V:, not project sources. No actual archive data belongs in Git.

## B. Approved new cluster creation only, AFTER network isolation

First manually confirm port 55433 is unused and both target paths are absent.
No reset, clean, deletion or reuse of existing paths is allowed.

```powershell
$pg = 'C:\Program Files\PostgreSQL\17\bin'
$cluster = 'V:\DrMAS-CoreRestore-PG17-20261104'
$private = 'V:\DrMAS-CoreRestore-Package-20261104'
if (Test-Path -LiteralPath $cluster) { throw 'Existing cluster path: stop' }
if (Get-NetTCPConnection -LocalPort 55433 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port in use: stop'
}
& "$pg\initdb.exe" -D $cluster -U postgres -W --encoding=UTF8 `
  --auth-host=scram-sha-256 --auth-local=scram-sha-256
if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
& "$pg\pg_ctl.exe" -D $cluster -l "$private\postgres.private.log" `
  -o '-h 127.0.0.1 -p 55433' start
if ($LASTEXITCODE -ne 0) { throw 'cluster start failed' }
& "$pg\createdb.exe" -h 127.0.0.1 -p 55433 -U postgres -W `
  --template=template0 drmas_core_restore_verify
if ($LASTEXITCODE -ne 0) { throw 'createdb failed; never reset an existing DB' }
```

Use a NEW local password, not Supabase's password. Do not save it in environment,
script, pgpass, transcript or command line. initdb/createdb/psql -W prompt only.
Postgres server errors can include data; logs stay encrypted/private. Do not share
or tail logs. This package uses psql VERBOSITY sqlstate to suppress error detail.

## C. Approved restore and checks, still fully offline

```powershell
$tools = 'C:\MAS\Dr-mas\supabase\verification\core-restore-package'
node "$tools\verify.cjs" $private before
if ($LASTEXITCODE -ne 0) { throw 'Package changed' }
& "$pg\psql.exe" -X -q -W -h 127.0.0.1 -p 55433 -U postgres `
  -d drmas_core_restore_verify -v ON_ERROR_STOP=1 `
  -f "$private\restore.private.sql"
$restoreCode = $LASTEXITCODE
Set-Content -LiteralPath "$private\restore-exit.txt" -Value $restoreCode
if ($restoreCode -ne 0) { throw 'Restore failed: report last STAGE and SQLSTATE only' }
# Guarded metadata export goes directly to a private file, not the console.
& "$pg\psql.exe" -X -q -W -h 127.0.0.1 -p 55433 -U postgres `
  -d drmas_core_restore_verify -v ON_ERROR_STOP=1 `
  -f "$private\export-catalog.private.sql" `
  -o "$private\actual-catalog.private.json"
$exportCode = $LASTEXITCODE
Set-Content -LiteralPath "$private\export-exit.txt" -Value $exportCode
if ($exportCode -ne 0) { throw 'Catalog export failed' }
node "$tools\verify.cjs" $private after
if ($LASTEXITCODE -ne 0) { throw 'NOT PASS: do not weaken parity checks' }
```

Restore phases: guard/fresh role+Auth setup -> archived pre-data -> UUID-only Auth
stubs -> archived core COPY -> private expected temp COPY -> archived post-data
(FK/index/RLS/ACL/triggers) -> full EXCEPT ALL multiset equality -> validated FKs,
privilege checks and restored-identity RLS -> synthetic A/B/G/H checks in rolled-back
subtransaction -> COMMIT. No actual row/row fingerprint is printed. Counts only.
Synthetic signup/approval/revocation/unauthorized-access tests roll back fixtures.
Do NOT apply the reconnect migration during this backup test.

The final offline check verifies package fingerprints, both actual psql exit codes,
and table/column/constraint/index/function/policy/trigger/enum/private-schema
catalog parity with the reviewed Dev snapshot, including definition/config hashes,
owners, grants and effective rights. Restore COMMIT alone is NOT final PASS.
Zero source rows alone cannot satisfy the synthetic behavioral checks.

After any success or failure, stop ONLY the new cluster BEFORE restoring network:

```powershell
& "$pg\pg_ctl.exe" -D $cluster -m fast stop
if ($LASTEXITCODE -ne 0) { throw 'Keep network disconnected; confirm cluster stopped' }
```

Preserve failed artifacts for investigation; no automatic deletion/repair/retry.
If the outer restore transaction failed, core DB changes roll back but the new
cluster and empty DB still exist. Do not rerun bootstrap blindly after a successful
COMMIT with failed metadata comparison. Never use --clean, --no-acl or --no-owner
to convert a failure into success. The original 55432 database is never a target.

## Interpretation

Only all checks passing yields CORE_DATA_PARTIAL_RESTORE_PASS. It proves the
selected archive data can be loaded with matching core DB definitions and local
role-simulated access. It does NOT prove full Supabase recovery, Auth identities,
passwords/sessions/MFA/JWTs, orphan Auth users, managed/default/public-schema ACLs,
Vault secrets, Storage binaries, Realtime, project settings, database locale/
collation equivalence, concurrent source
freshness or original pg_dump completion. Keep original archive/checksum intact.
Dev backup/forward-recovery approval and actual JWT tests remain separate gates.
