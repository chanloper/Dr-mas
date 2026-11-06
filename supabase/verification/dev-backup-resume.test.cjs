'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const script=path.join(__dirname,'prepare-dev-backup.ps1');
const runner=path.join(__dirname,'core-restore-package/run-offline-restore.ps1');
const quote=s=>s.replaceAll("'","''");
function functions(file,names){return `$t=$null;$e=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${quote(file)}',[ref]$t,[ref]$e);if($e.Count){exit 90};foreach($fnName in @(${names.map(x=>`'${x}'`).join(',')})){$fn=$ast.FindAll({param($x)$x -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object Name -eq $fnName;Invoke-Expression $fn.Extent.Text};`;}
function ps(code){const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;trap{Write-Output ('SYNTHETIC_FAILURE_LINE='+$_.InvocationInfo.ScriptLineNumber);Write-Output ('SYNTHETIC_FAILURE_COLUMN='+$_.InvocationInfo.OffsetInLine);exit 91};${code}`],{encoding:'utf8'});assert.equal(r.status,0,'synthetic resume check failed (raw diagnostics suppressed): '+r.stdout.trim());return r.stdout.trim();}
function sample(){return {format:'drmas-reconnect-data-preservation-v1',server_major:17,read_only:true,old_pair_constraint_count:1,new_index_present:false,closure_reason_present:false,rls_table_count:4,fingerprints:['care_links','medication_records','medications','profiles'].map(name=>({name,rows:0,fingerprint:'a'.repeat(64)})),states:{}};}
function fixture(){const d=fs.mkdtempSync(path.join(os.tmpdir(),'drmas-resume-synthetic-'));const dump=Buffer.from('SYNTHETIC_ARCHIVE_NOT_A_REAL_BACKUP');fs.writeFileSync(path.join(d,'database.dump'),dump);fs.writeFileSync(path.join(d,'database.dump.sha256'),crypto.createHash('sha256').update(dump).digest('hex')+'  database.dump\n');fs.writeFileSync(path.join(d,'pg_dump-exit.txt'),'0');fs.writeFileSync(path.join(d,'before.private.json'),JSON.stringify(sample()));fs.writeFileSync(path.join(d,'after-backup.private.json'),'');return d;}
function cleanup(d){for(const n of fs.readdirSync(d)){const p=path.join(d,n);if(fs.statSync(p).isDirectory()){for(const f of fs.readdirSync(p))fs.unlinkSync(path.join(p,f));fs.rmdirSync(p);}else fs.unlinkSync(p);}fs.rmdirSync(d);}
function hashes(d){return Object.fromEntries(fs.readdirSync(d).filter(n=>fs.statSync(path.join(d,n)).isFile()).map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(d,n))).digest('hex')]));}
test('resume validates original exit/hash and compares semantic state without changing original artifacts',()=>{
 const d=fixture(),before=hashes(d);try{
  const code=functions(script,['Get-ArchiveHash','Read-Preservation','Read-ResumeArtifacts','Compare-Preservation','Write-NewJson'])+`
  $saved=Read-ResumeArtifacts '${quote(d)}';$other=Read-Preservation '${quote(d)}/before.private.json';
  $other.fingerprints=@($other.fingerprints|Sort-Object name -Descending);
  if(!(Compare-Preservation $saved.before $other)){exit 1};$other.fingerprints[0].rows=1;
  if(Compare-Preservation $saved.before $other){exit 2};
  $new=Join-Path '${quote(d)}' 'new';New-Item -ItemType Directory -Path $new|Out-Null;
  Write-NewJson "$new/result.json" @{same=$false;immediatePostBackupStateProven=$false};
  $refused=$false;try{Write-NewJson "$new/result.json" @{same=$true}}catch{$refused=$true};if(!$refused){exit 3};Write-Output 'SYNTHETIC_RESUME_PASS'`;
  assert.equal(ps(code),'SYNTHETIC_RESUME_PASS');assert.deepEqual(hashes(d),before);
 }finally{cleanup(d);}
});
for(const fault of ['exit','checksum','before'])test(`resume rejects invalid existing ${fault} evidence locally`,()=>{
 const d=fixture();try{if(fault==='exit')fs.writeFileSync(path.join(d,'pg_dump-exit.txt'),'1');if(fault==='checksum')fs.writeFileSync(path.join(d,'database.dump.sha256'),'wrong');if(fault==='before')fs.writeFileSync(path.join(d,'before.private.json'),'{}');
  assert.equal(ps(functions(script,['Get-ArchiveHash','Read-Preservation','Read-ResumeArtifacts'])+`$blocked=$false;try{Read-ResumeArtifacts '${quote(d)}'|Out-Null}catch{$blocked=$true};if(!$blocked){exit 4};Write-Output 'BLOCKED'`),'BLOCKED');
 }finally{cleanup(d);}
});
for(const scenario of ['success','auth','tls','unknown-exit','invalid-json'])test(`query status recording simulation: ${scenario}`,()=>{
 const d=fixture(),original=hashes(d);try{const out=path.join(d,'resume');fs.mkdirSync(out);
  const code=functions(script,['Read-Preservation','Write-NewJson','Invoke-RecordedQuery'])+`
  $pg='SYNTHETIC_NO_EXE';$scenario='${scenario}';
  function Invoke-NativeDiagnostic {param($Exe,$Arguments,$Log)
   if($Exe -notlike '*psql.exe' -or $Arguments -notcontains 'VERBOSITY=sqlstate'){throw 'NOT_READ_QUERY'};
   if($scenario -eq 'success'){[IO.File]::WriteAllText($Log,[IO.File]::ReadAllText('${quote(d)}/before.private.json'))}
   else{[IO.File]::WriteAllText($Log,'')};
   $diag=if($scenario -eq 'auth'){'AUTH'}elseif($scenario -eq 'tls'){'TLS'}elseif($scenario -eq 'unknown-exit'){'OUTPUT_IO'}else{'NONE'};
   $code=if($scenario -in @('auth','tls')){2}else{0};
   return [pscustomobject]@{ExitObserved=($scenario -ne 'unknown-exit');ExitCode=$code;Diagnostic=$diag}
  }
  $ok=$false;try{Invoke-RecordedQuery '${quote(out)}' @('SYNTHETIC') 'READONLY_QUERY'|Out-Null;$ok=$true}catch{};
  if($ok -ne ($scenario -eq 'success')){exit 5};
  $s=Get-Content -LiteralPath '${quote(out)}/query-status.private.json' -Raw|ConvertFrom-Json;
  if($scenario -eq 'auth' -and ($s.exitCode -ne 2 -or $s.diagnostic -ne 'AUTH')){exit 6};
  if($scenario -eq 'unknown-exit' -and $null -ne $s.exitCode){exit 7};
  if($scenario -eq 'invalid-json' -and !(Test-Path -LiteralPath '${quote(out)}/query-result.private.json.validation-status.json')){exit 8};
  Write-Output 'QUERY_RECORD_PASS'`;
  assert.equal(ps(code),'QUERY_RECORD_PASS');assert.deepEqual(hashes(d),original);
 }finally{cleanup(d);}
});
test('native diagnostics are fixed categories and never emit supplied raw stderr',()=>{
 const d=fixture();try{const child=path.join(d,'synthetic-errors.js');fs.writeFileSync(child,"process.stderr.write(process.argv[2]+' SYNTHETIC_SECRET_VALUE');process.exitCode=2;");
  const code=functions(runner,['Initialize-SafeNativeRunner','Invoke-NativeDiagnostic'])+`
  $cases=@(@('password authentication failed','AUTH'),@('certificate verify failed','TLS'),@('timeout expired','CONNECT_TIMEOUT'),@('ERROR:  57014','SQL_TIMEOUT'),@('ERROR:  42501','SQL_PERMISSION'),@('unclassified native failure','UNKNOWN'));
  $i=0;foreach($case in $cases){$i++;$r=Invoke-NativeDiagnostic '${quote(process.execPath)}' @('${quote(child)}',$case[0]) ('${quote(d)}/diag'+$i+'.txt');if($r.ExitCode -ne 2 -or !$r.ExitObserved -or $r.Diagnostic -ne $case[1]){exit 9}};Write-Output 'DIAGNOSTICS_PASS'`;
  const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8'});assert.equal(r.status,0,'diagnostic check failed');assert.equal(r.stdout.trim(),'DIAGNOSTICS_PASS');assert.equal(r.stderr.trim(),'');
 }finally{cleanup(d);}
});
test('resume is gated and exits before pg_dump; deferred comparison is never contemporaneous proof',()=>{
 const src=fs.readFileSync(script,'utf8');const branch=src.slice(src.indexOf("$stage='resume_archive_checks'"),src.indexOf("$stage='dev_read_only_before'"));
 assert.ok(branch.includes('exit 0'));assert.ok(branch.includes('exit 2'));assert.ok(!branch.includes('pg_dump.exe'));
 assert.ok(src.indexOf('if(-not $Execute)')<src.indexOf('Read-Host'));
 assert.match(src,/RESUME-READONLY-DEV/);assert.match(src,/immediatePostBackupStateProven=\$false/);assert.match(src,/subsequentWritesPossible=\$true/);
});
