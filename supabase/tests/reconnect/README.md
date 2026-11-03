# Local PostgreSQL reconnect integration tests

The user reports PostgreSQL 17.11 execution PASS. Session A detailed output and
independent cleanup confirmation remain outstanding; see
[results and Dev readiness](../../proposals/reconnect-dev-readiness.md).

Target is strictly 127.0.0.1:55432/drmas_rls_test, PostgreSQL 17, trusted
postgres owner. No remote connection, bootstrap, initial migration or proposal
application occurs in these tests. All three must already be applied.

The guard checks the target, RLS flags, active unique index, removal of the old
constraint, exact stored RPC/helper/Auth substitute source and RPC grants.
It does not claim to compare the entire deployed schema. Source comparisons
remove CR and surrounding whitespace only. Unexpected definitions fail closed.
The guard never calls pg_get_functiondef or prints stored function bodies.

PowerShell, for EVERY terminal (password only in the -W prompt):

```powershell
$pg = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$tests = 'C:\MAS\Dr-mas\supabase\tests\reconnect'
$dbArgs = @('-X','-W','-h','127.0.0.1','-p','55432','-U','postgres',
            '-d','drmas_rls_test','-v','ON_ERROR_STOP=1')
```

1. Run the single-session test:

```powershell
& $pg @dbArgs -f "$tests\single-session.sql"
$LASTEXITCODE
```

Expect PASS notices and `PASS single_session_rolled_back`, exit 0. All fixtures
and helper schema roll back, also when psql exits after an error. Existing rows
are never deleted. Reserved synthetic UUID collisions abort before inserting.

2. Prepare committed race fixtures, once:

```powershell
& $pg @dbArgs -f "$tests\concurrency-setup.sql"
$LASTEXITCODE
```

Expect `PASS race_setup`, exit 0. This creates exactly two synthetic Auth users
and profiles and a dedicated manifest schema. Existing manifest/UUIDs abort; do
not drop anything or repeat setup blindly.

3. Open TWO PowerShell windows and enter the shared variables above in both.
Start A and enter its password. When `READY session_A_waiting_start_B_now`
appears, immediately start B and enter its password within 30 seconds.
Neither command is a background job.

Terminal A:

```powershell
& $pg @dbArgs -f "$tests\session-a.sql"
$LASTEXITCODE
```

Terminal B:

```powershell
& $pg @dbArgs -f "$tests\session-b.sql"
$LASTEXITCODE
```

A inserts under an explicit uncommitted transaction. B attempts the same pair
in another transaction. A must observe its backend PID in B's pg_blocking_pids
before committing. B must catch exactly SQLSTATE 23505. Unobserved waits or any
other error are failures. Statement timeout 45s, lock timeout 35s, observation
deadline 30s. If B starts too late or too early the test may fail safely; never
interpret this as PASS or relax the assertions. Both terminals must finish.

4. After BOTH processes finish, verify, then always clean up the race fixtures:

```powershell
& $pg @dbArgs -f "$tests\concurrency-verify.sql"
$LASTEXITCODE
# Record the verify result BEFORE cleanup. Cleanup is needed even on test failure.
& $pg @dbArgs -f "$tests\concurrency-cleanup.sql"
$LASTEXITCODE
```

Expect `PASS real_concurrency_one_active_pair` and then
`PASS race_fixtures_removed`, each exit 0. Verification requires both recorded
session outcomes and exactly one total/active row for the synthetic pair.
Cleanup checks the fixture manifest, live session names and unexpected related
data, then deletes ONLY the two reserved identities and their synthetic pair.
No CASCADE, TRUNCATE or application table DROP is used. If cleanup refuses,
stop and investigate; never broaden DELETE predicates or reset the database.
Closing a test terminal unexpectedly can leave committed race fixtures: use the
same guarded cleanup after both sessions have ended. Cleanup success alone is
not evidence that the concurrency test passed.

No credentials, JWTs, rows, UUID results or medical content are printed. Expected
failures are checked inside exception blocks; unexpected failures use terse psql
errors (message/SQLSTATE, no DETAIL/CONTEXT). Report only failed test label,
SQLSTATE and cause, without copying any unexpected raw sensitive output.

These are real SQL/RLS checks using SET LOCAL ROLE authenticated and synthetic
subject settings. They do NOT validate JWT signatures, expiry, refresh, gateway
role selection or deployed Dev policy parity. Those need separately approved
synthetic A/B/guardian Auth accounts using ordinary JWTs and Data API/RPC, never
service_role or owner-query success as proof of RLS.

Read-only residual-fixture confirmation (never deletes or repairs anything):

```powershell
& $pg @dbArgs -f "$tests\cleanup-readonly.sql"
$LASTEXITCODE
```

Expected: all counts zero, both helpers_removed true, exit 0. Report counts and
booleans only. This does not recreate the manifest or recover lost session A logs.
