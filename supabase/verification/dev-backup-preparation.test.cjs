const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const script=path.join(__dirname,'prepare-dev-backup.ps1');const ps=fs.readFileSync(script,'utf8');
const sql=fs.readFileSync(path.join(__dirname,'reconnect-data-preservation-readonly.sql'),'utf8').replace(/--[^\n]*/g,'');
test('backup preparation parses in Windows PowerShell without executing it',()=>{
 const code=`$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'","''")}',[ref]$t,[ref]$e);if($e.Count){exit 1}`;
 const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8'});assert.equal(r.status,0);
});
test('preservation output is read-only, aggregate only and excludes new closure column from old data fingerprint',()=>{
 assert.match(sql,/begin transaction isolation level repeatable read read only/);
 assert.match(sql,/rollback;/);
 assert.doesNotMatch(sql,/\b(create|alter|drop|insert|update|delete|truncate|execute|call|commit|copy)\b/i);
 assert.equal((sql.match(/sha256\(convert_to/g)||[]).length,4);
 assert.match(sql,/to_jsonb\(t\)-'closure_reason'/);
 assert.match(sql,/set local timezone='UTC'/);
});
test('new backup records real exit codes, gates execution, preserves old files and never invokes migration',()=>{
 assert.ok(ps.indexOf('if(-not $Execute)')<ps.indexOf('Read-Host'));
 assert.match(ps,/WriteAllText\("\$out\\pg_dump-exit.txt",\[string\]\$code\)/);
 assert.match(ps,/SOURCE_CHANGED_DURING_BACKUP/);
 assert.match(ps,/verify-full/);
 assert.match(ps,/archive-toc.private.txt/);
 assert.match(ps,/--file=NUL/);
 assert.match(ps,/restoreValidation='unverified-deferred'/);
 assert.doesNotMatch(ps,/Remove-Item|Set-Service|Stop-Service|--clean|--password=/);
 assert.doesNotMatch(ps,/'-f',\$sql|'-f',"\$sql"/);
});
