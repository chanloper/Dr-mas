import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const path=resolve('scripts/mfds-pilot.ps1').replace(/'/g,"''");
/** Both prompts and Node are replaced inside this isolated PowerShell process.
 * No path through this harness can execute the real HTTP command.
 */
function harness(mode:'cancel'|'success'|'failure'|'preflight',maxRows=5) {
  const command=`
$env:DATA_GO_KR_SERVICE_KEY = 'previous-synthetic-key'
$env:NODE_OPTIONS = '--trace-warnings'
$env:NODE_DEBUG = 'http'
$env:NODE_DEBUG_NATIVE = 'http'
$global:calls = 0
$global:keyReads = 0
$global:childSafe = $false
$global:argumentsSafe = $false
$global:LASTEXITCODE = 0
$beforeDirectory = (Get-Location).Path
function Read-Host {
  param([string]$Prompt, [switch]$AsSecureString)
  if ($AsSecureString) {
    $global:keyReads++
    return (ConvertTo-SecureString 'synthetic-hidden-key' -AsPlainText -Force)
  }
  return '${mode==='cancel'?'NO':`COLLECT ${maxRows}`} '.Trim()
}
function node {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CliArguments)
  $global:calls++
  $expectedKey = '${mode==='preflight'?'previous-synthetic-key':'synthetic-hidden-key'}'
  $global:childSafe = ($env:DATA_GO_KR_SERVICE_KEY -ceq $expectedKey) -and (-not $env:NODE_DEBUG) -and (-not $env:NODE_DEBUG_NATIVE) -and (-not $env:NODE_OPTIONS)
  $joined = $CliArguments -join ' '
  $global:argumentsSafe = (-not $joined.Contains('synthetic')) -and $joined.Contains('${mode==='preflight'?'preflight':maxRows===5?'--approve-live-max-5 --portal-approved':'--approve-live --portal-approved'}') ${maxRows===5?'':`-and $joined.Contains('--max-rows=${maxRows}')`}
  if ('${mode}' -eq 'failure') { throw 'SYNTHETIC_FAILURE_WITH_synthetic-hidden-key' }
  $global:LASTEXITCODE = 0
}
& '${path}' ${mode==='preflight'?'-Preflight':''} -MaxRows ${maxRows}
$childExit = $LASTEXITCODE
$restored = ($env:DATA_GO_KR_SERVICE_KEY -ceq 'previous-synthetic-key') -and ($env:NODE_OPTIONS -ceq '--trace-warnings') -and ($env:NODE_DEBUG -ceq 'http') -and ($env:NODE_DEBUG_NATIVE -ceq 'http') -and ((Get-Location).Path -ceq $beforeDirectory)
[Console]::WriteLine((@{calls=$global:calls;keyReads=$global:keyReads;childSafe=$global:childSafe;argumentsSafe=$global:argumentsSafe;restored=$restored;childExit=$childExit} | ConvertTo-Json -Compress))
exit 0
`;
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{
    encoding:'utf8',env:{...process.env,DATA_GO_KR_SERVICE_KEY:'',NODE_OPTIONS:'',NODE_DEBUG:'',NODE_DEBUG_NATIVE:''}
  });
  assert.equal(result.status,0,result.stderr);
  assert.ok(!result.stdout.includes('synthetic-hidden-key'));assert.ok(!result.stderr.includes('synthetic-hidden-key'));
  assert.ok(!result.stdout.includes('previous-synthetic-key'));assert.ok(!result.stderr.includes('previous-synthetic-key'));
  const line=result.stdout.split(/\r?\n/).find(l=>l.startsWith('{'));
  assert.ok(line,result.stdout);return JSON.parse(line) as {calls:number;keyReads:number;childSafe:boolean;argumentsSafe:boolean;restored:boolean;childExit:number};
}

test('PowerShell cancellation does not ask for a key or launch Node',()=>{
  const r=harness('cancel');assert.equal(r.calls,0);assert.equal(r.keyReads,0);assert.equal(r.restored,true);
});
test('PowerShell hidden input reaches only the child environment and is restored afterward',()=>{
  const r=harness('success');assert.equal(r.calls,1);assert.equal(r.keyReads,1);assert.equal(r.childSafe,true);assert.equal(r.argumentsSafe,true);assert.equal(r.restored,true);assert.equal(r.childExit,0);
});
test('PowerShell restores secrets after child failure and suppresses its exception',()=>{
  const r=harness('failure');assert.equal(r.calls,1);assert.equal(r.childSafe,true);assert.equal(r.restored,true);assert.equal(r.childExit,1);
});
test('PowerShell preflight skips secret prompts and passes only the offline command',()=>{
  const r=harness('preflight');assert.equal(r.calls,1);assert.equal(r.keyReads,0);assert.equal(r.childSafe,true);assert.equal(r.argumentsSafe,true);assert.equal(r.restored,true);
});
test('PowerShell scale scope passes the approved row limit and still protects the key',()=>{
  const r=harness('success',20);assert.equal(r.calls,1);assert.equal(r.keyReads,1);assert.equal(r.childSafe,true);assert.equal(r.argumentsSafe,true);assert.equal(r.restored,true);
});
test('PowerShell scale preflight and cancellation make no real API requests',()=>{
  const p=harness('preflight',50);assert.equal(p.calls,1);assert.equal(p.keyReads,0);assert.equal(p.argumentsSafe,true);
  const c=harness('cancel',50);assert.equal(c.calls,0);assert.equal(c.keyReads,0);assert.equal(c.restored,true);
});
