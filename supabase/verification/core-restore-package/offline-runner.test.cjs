'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const file=path.join(__dirname,'run-offline-restore.ps1');
const source=fs.readFileSync(file,'utf8');
function powershell(code){
 const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8'});
 assert.equal(r.status,0,'static/pure-function checks failed');return r.stdout.trim();
}
test('Windows PowerShell parser accepts runner without executing it',()=>{
 const p=file.replaceAll("'","''");
 assert.equal(powershell(`$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${p}',[ref]$tokens,[ref]$errors);if($errors.Count){exit 1};Write-Output 'PARSE_PASS'`),'PARSE_PASS');
});
test('pure isolation and sizing functions fail closed for active physical, virtual and tunnel interfaces',()=>{
 const p=file.replaceAll("'","''");
 const code=`$t=$null;$e=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${p}',[ref]$t,[ref]$e);
 foreach($name in @('Test-IsolatedInterfaces','Get-RequiredSpace')){
 $fn=$ast.FindAll({param($x) $x -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object Name -eq $name;
 Invoke-Expression $fn.Extent.Text }
 $loop=[pscustomobject]@{OperationalStatus=[System.Net.NetworkInformation.OperationalStatus]::Up;NetworkInterfaceType=[System.Net.NetworkInformation.NetworkInterfaceType]::Loopback};
 if(!(Test-IsolatedInterfaces @($loop))){exit 2};
 foreach($kind in @('Ethernet','Wireless80211','Tunnel')){
 $item=[pscustomobject]@{OperationalStatus=[System.Net.NetworkInformation.OperationalStatus]::Up;NetworkInterfaceType=[System.Net.NetworkInformation.NetworkInterfaceType]::$kind};
 if(Test-IsolatedInterfaces @($loop,$item)){exit 3};$item.OperationalStatus=[System.Net.NetworkInformation.OperationalStatus]::Down;
 if(!(Test-IsolatedInterfaces @($loop,$item))){exit 4} }
 if((Get-RequiredSpace 1000) -ne 2GB){exit 5};if((Get-RequiredSpace 1GB) -ne 21GB){exit 6};Write-Output 'PURE_CHECKS_PASS'`;
 assert.equal(powershell(code),'PURE_CHECKS_PASS');
});
test('runner requires kernel VeraCrypt mapping, free space, target guards and explicit execution approval',()=>{
 for(const s of ['QueryDosDevice','Win32_SystemDriver','VERACRYPT_DRIVER_UNCONFIRMED','AvailableFreeSpace','V_INSUFFICIENT_FREE_SPACE','CLUSTER_PATH_ALREADY_EXISTS','PORT_55433_IN_USE','APPROVE-LOCAL-PARTIAL-RESTORE'])assert.ok(source.includes(s));
 assert.ok(source.indexOf('if (-not $Execute)')<source.indexOf("Invoke-Step 'initdb'"));
 assert.doesNotMatch(source,/New-NetFirewallRule|Disable-NetAdapter|Stop-Service|Set-Service|Remove-Item|--clean|--no-acl|--no-owner|register\b/i);
});
test('runner confines all database writes to new cluster and preserves sensitive artifacts',()=>{
 assert.match(source,/-h 127\.0\.0\.1 -p 55433/);
 assert.match(source,/'-p','55433'/);
 assert.doesNotMatch(source,/'-p','55432'/);
 assert.match(source,/FileMode\]::CreateNew/);
 assert.match(source,/RUN_ARTIFACT_ALREADY_EXISTS/);
 assert.match(source,/finally \{/);
 assert.match(source,/KEEP_NETWORK_OFFLINE_AND_V_MOUNTED/);
 assert.match(source,/Get-Process -Id \$trackedProcessId/);
 assert.ok(source.indexOf("Invoke-Step 'verify'")<source.lastIndexOf('PASS CORE_DATA_PARTIAL_RESTORE'));
});

function importFunctions(names){
 const p=file.replaceAll("'","''");
 return `$t=$null;$e=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${p}',[ref]$t,[ref]$e);
 foreach($fnName in @(${names.map(n=>`'${n}'`).join(',')})){
 $definition=$ast.FindAll({param($x) $x -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object Name -eq $fnName;
 Invoke-Expression $definition.Extent.Text }
 `;
}
for(const scenario of ['stopped','stop-error','port-remains','pid-remains','process-remains','probe-error']){
 test(`owned cluster shutdown simulation: ${scenario}`,()=>{
  const code=importFunctions(['Stop-OwnedCluster'])+`
  $originalAutomaticPid=$PID;$ownedCluster=$true;$pgBin='SYNTHETIC';$private='SYNTHETIC';$cluster='V:\\SYNTHETIC-RESTORE-ONLY';
  $trackedPids=New-Object 'System.Collections.Generic.HashSet[int]';[void]$trackedPids.Add(101);[void]$trackedPids.Add(102);
  $scenario='${scenario}';$script:pathCalls=0;$script:stopCalls=0;$script:processCalls=0;
  function Remember-ClusterProcesses { if($scenario -eq 'probe-error'){throw 'SYNTHETIC_PROBE_ERROR'} }
  function Test-Path { param($LiteralPath) $script:pathCalls++; return ($script:pathCalls -eq 1 -or $scenario -eq 'pid-remains') }
  function Invoke-NativeSafely { param($Exe,$Arguments,$Log)
   if($Arguments[0] -ne '-D' -or $Arguments[1] -ne $cluster -or $Arguments -contains '55432'){throw 'WRONG_TARGET'}
   $script:stopCalls++;if($scenario -eq 'stop-error'){return 1};return 0 }
  function Get-PortListeners { param($Port) if($Port -ne 55433){throw 'WRONG_PORT'};if($scenario -eq 'port-remains'){return 'SYNTHETIC_LISTENER'} }
  function Get-Process { param($Id,$ErrorAction) $script:processCalls++;if($scenario -eq 'process-remains'){return 'SYNTHETIC_PROCESS'} }
  $result=Stop-OwnedCluster;
  if($PID -ne $originalAutomaticPid){exit 8};
  if($scenario -eq 'stopped'){
   if($result -ne $true -or $script:stopCalls -ne 1 -or $script:processCalls -ne 2){exit 9}
  }elseif($result -ne $false){exit 10};
  Write-Output 'SHUTDOWN_SCENARIO_PASS'`;
  assert.equal(powershell(code),'SHUTDOWN_SCENARIO_PASS');
 });
}
test('safe native bridge suppresses arbitrary stderr while preserving exit and fixed password prompt',()=>{
 const node=process.execPath.replaceAll("'","''");
 const code=importFunctions(['Initialize-SafeNativeRunner','Invoke-NativeSafely'])+`
 $temp=Join-Path ([IO.Path]::GetTempPath()) ('drmas-synthetic-stderr-'+[guid]::NewGuid().ToString('N'));
 [IO.Directory]::CreateDirectory($temp)|Out-Null;
 $log=Join-Path $temp 'synthetic.log';$scriptFile=Join-Path $temp 'synthetic child.js';
 try {
  [IO.File]::WriteAllText($scriptFile,'process.stdout.write("SYNTHETIC_STDOUT");process.stderr.write("SYNTHETIC_SECRET_SENTINEL\\nPassword: Password for user postgres.syntheticproject: ");process.exitCode=7;');
  $result=Invoke-NativeSafely '${node}' @($scriptFile) $log;
  if($result -ne 7 -or [IO.File]::ReadAllText($log) -ne 'SYNTHETIC_STDOUT'){exit 11};
  $refused=$false;try{Invoke-NativeSafely '${node}' @($scriptFile) $log|Out-Null}catch{$refused=$true};
  if(!$refused){exit 12};Write-Output 'NATIVE_FILTER_PASS'
 }finally{
  if([IO.File]::Exists($log)){[IO.File]::Delete($log)};
  if([IO.File]::Exists($scriptFile)){[IO.File]::Delete($scriptFile)};
  [IO.Directory]::Delete($temp)
 }`;
 const r=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8'});
 assert.equal(r.status,0,'synthetic native bridge failed');
 assert.equal(r.stdout.trim(),'NATIVE_FILTER_PASS');
 assert.ok(r.stderr.includes('Local password (hidden input): '));
 assert.ok(!r.stderr.includes('SYNTHETIC_SECRET_SENTINEL'));
 assert.ok(!r.stderr.includes('postgres.syntheticproject'));
 assert.equal((r.stderr.match(/Local password \(hidden input\): /g)||[]).length,2);
});
test('shutdown variables do not write PowerShell automatic/read-only names; failure keeps offline instruction',()=>{
 const code=importFunctions([])+`
 $fn=$ast.FindAll({param($x) $x -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object Name -eq 'Stop-OwnedCluster';
 $loop=$fn.FindAll({param($x) $x -is [System.Management.Automation.Language.ForEachStatementAst]},$true);
 foreach($loopNode in $loop){if($loopNode.Variable.VariablePath.UserPath -in @('PID','HOME','Host','PSHOME','args','input','Error','null','true','false')){exit 13}}
 Write-Output 'AUTOMATIC_NAMES_PASS'`;
 assert.equal(powershell(code),'AUTOMATIC_NAMES_PASS');
 assert.match(source,/else \{ Write-Host 'FAIL STOP_UNCONFIRMED; KEEP_NETWORK_OFFLINE_AND_V_MOUNTED' \}/);
 assert.doesNotMatch(source,/foreach \(\$id in/);
});
