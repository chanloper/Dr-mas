# PREPARED ONLY. Interactive local execution explicitly approved by the user.
# No migration, UPDATE/DELETE or restore is invoked. Passwords use native -W only.
[CmdletBinding()]
param([switch]$Execute, [switch]$Resume, [string]$BackupDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$stage='local_preflight'
$pg='C:\Program Files\PostgreSQL\17\bin'
$sql=Join-Path $PSScriptRoot '..\proposals\202611030001_care_link_rerequest.sql'
$expectedHash='1a3a0302d687eb8b276429678e199311a613c49ec28b75f6fe9334163d4df883'
$oldMode=$env:PGSSLMODE
$oldRoot=$env:PGSSLROOTCERT
$oldTimeout=$env:PGCONNECT_TIMEOUT
function Get-ArchiveHash([string]$Path) {
 $stream=[IO.File]::OpenRead($Path);$algorithm=[Security.Cryptography.SHA256]::Create()
 try {return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
 finally {$algorithm.Dispose();$stream.Dispose()}
}
function Write-NewJson([string]$Path, $Value) {
 $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try {$bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 20 -Compress));$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
}
function Read-Preservation([string]$Path) {
 $v=Get-Content -LiteralPath $Path -Raw -ErrorAction Stop|ConvertFrom-Json
 if($v.format -ne 'drmas-reconnect-data-preservation-v1' -or $v.server_major -ne 17 -or $v.read_only -isnot [bool] -or $v.read_only -ne $true){throw 'PRESERVATION_FORMAT'}
 $names=@('care_links','medication_records','medications','profiles')
 if(@($v.fingerprints).Count -ne 4){throw 'PRESERVATION_COLLECTIONS'}
 foreach($name in $names){
  $items=@($v.fingerprints|Where-Object name -eq $name)
  if($items.Count -ne 1 -or ($items[0].rows -isnot [int] -and $items[0].rows -isnot [long]) -or $items[0].rows -lt 0 -or $items[0].fingerprint -notmatch '^[a-f0-9]{64}$'){throw 'PRESERVATION_COLLECTIONS'}
 }
 foreach($state in $v.states.PSObject.Properties){if($state.Name -notin @('pending','approved','revoked') -or ($state.Value -isnot [int] -and $state.Value -isnot [long]) -or $state.Value -lt 0){throw 'PRESERVATION_STATES'}}
 return $v
}
function Compare-Preservation($Before, $After) {
 # Whitelisted fields only; array/object member ordering is not a data difference.
 foreach($field in @('server_major','read_only','old_pair_constraint_count','new_index_present','closure_reason_present','rls_table_count')){
  if($Before.$field -cne $After.$field){return $false}
 }
 foreach($entry in $Before.fingerprints){
  $other=@($After.fingerprints|Where-Object name -eq $entry.name)
  if($other.Count -ne 1 -or $other[0].rows -ne $entry.rows -or $other[0].fingerprint -cne $entry.fingerprint){return $false}
 }
 foreach($state in @('pending','approved','revoked')){
  $a=$Before.states.PSObject.Properties[$state];$b=$After.states.PSObject.Properties[$state]
  if(($null -eq $a) -ne ($null -eq $b)){return $false}
  if($null -ne $a -and $a.Value -ne $b.Value){return $false}
 }
 return $true
}
function Read-ResumeArtifacts([string]$Directory) {
 foreach($name in @('database.dump','database.dump.sha256','pg_dump-exit.txt','before.private.json')){
  $item=Get-Item -LiteralPath (Join-Path $Directory $name) -ErrorAction Stop
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'RESUME_ARTIFACT_PATH'}
 }
 if((Get-Content -LiteralPath "$Directory\pg_dump-exit.txt" -Raw).Trim() -cne '0'){throw 'ORIGINAL_DUMP_EXIT_NOT_ZERO'}
 if((Get-Item -LiteralPath "$Directory\database.dump").Length -eq 0){throw 'EMPTY_DUMP'}
 $hash=Get-ArchiveHash "$Directory\database.dump"
 if((Get-Content -LiteralPath "$Directory\database.dump.sha256" -Raw).Trim() -cne ($hash+'  database.dump')){throw 'CHECKSUM_MISMATCH'}
 return @{before=(Read-Preservation "$Directory\before.private.json");hash=$hash;dump=(Join-Path $Directory 'database.dump')}
}
function Invoke-RecordedQuery([string]$Directory, [string[]]$ConnectionArgs, [string]$QueryPath,
 [string]$ResultName='query-result.private.json', [string]$StatusName='query-status.private.json') {
 if([IO.Path]::GetFileName($ResultName) -ne $ResultName -or [IO.Path]::GetFileName($StatusName) -ne $StatusName){throw 'QUERY_OUTPUT_PATH'}
 $result=Invoke-NativeDiagnostic "$pg\psql.exe" (@('-X','-q','-A','-t')+$ConnectionArgs+@('-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-f',$QueryPath)) "$Directory\$ResultName"
 $exitCode=$null;if($result.ExitObserved){$exitCode=$result.ExitCode}
 Write-NewJson "$Directory\$StatusName" @{exitCode=$exitCode;diagnostic=$result.Diagnostic;nativeExitObserved=$result.ExitObserved}
 if(-not $result.ExitObserved -or $result.ExitCode -ne 0 -or $result.Diagnostic -in @('OUTPUT_IO','NATIVE_START')){throw 'READ_ONLY_QUERY_FAILED'}
 try {return Read-Preservation "$Directory\$ResultName"} catch {
  Write-NewJson "$Directory\$ResultName.validation-status.json" @{diagnostic='INVALID_RESULT';exitCode=$exitCode}
  throw 'INVALID_QUERY_RESULT'
 }
}
try {
 if((Get-ArchiveHash $sql) -ne $expectedHash){throw 'SQL_HASH_CHANGED'}
 if($Resume){
  if(-not $BackupDirectory -or [IO.Path]::GetFullPath($BackupDirectory) -notmatch '^V:\\DrMAS-Dev-pre-reconnect-[^\\]+\\?$'){throw 'RESUME_DIRECTORY_REQUIRED'}
  $BackupDirectory=(Get-Item -LiteralPath $BackupDirectory -ErrorAction Stop).FullName.TrimEnd('\')
  if(((Get-Item -LiteralPath $BackupDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'RESUME_DIRECTORY_REPARSE'}
  $saved=Read-ResumeArtifacts $BackupDirectory
 }elseif($BackupDirectory){throw 'BACKUP_DIRECTORY_REQUIRES_RESUME'}
 if(-not $Execute){Write-Host 'PASS LOCAL_HASH_CHECKS_ONLY; NO_REMOTE_QUERY; ARCHIVE_READ_ON_EXECUTE';exit 0}
 foreach($name in @('PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','PGPASSFILE')){
  if(Test-Path -LiteralPath "Env:$name"){throw 'UNEXPECTED_LIBPQ_ENVIRONMENT'}
 }
 # Reuse only the stderr-filtering native bridge; never execute the offline runner.
 $runner=Join-Path $PSScriptRoot 'core-restore-package\run-offline-restore.ps1'
 $tokens=$null;$errors=$null
 $ast=[System.Management.Automation.Language.Parser]::ParseFile($runner,[ref]$tokens,[ref]$errors)
 if($errors.Count){throw 'NATIVE_BRIDGE_PARSE_FAILED'}
 foreach($fnName in @('Initialize-SafeNativeRunner','Invoke-NativeSafely','Invoke-NativeDiagnostic')){
  $fn=@($ast.FindAll({param($x) $x -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object Name -eq $fnName)
  if($fn.Count -ne 1){throw 'NATIVE_BRIDGE_MISSING'}
  Invoke-Expression $fn[0].Extent.Text
 }
 $reference=Read-Host 'DrMAS-Dev project reference only (not URL/key/password)'
 $sourceHost=Read-Host 'Dashboard Connect: Direct or Session pooler hostname only'
 $sourceUser=Read-Host 'Dashboard Connect: database username'
 $ca=Read-Host 'Official project CA certificate absolute path'
 if($reference -notmatch '^[a-z0-9]{20}$'){throw 'PROJECT_REFERENCE_FORMAT'}
 $direct=$sourceHost -ceq "db.$reference.supabase.co" -and $sourceUser -ceq 'postgres'
 $pool=$sourceHost -match '^aws-[a-z0-9-]+\.pooler\.supabase\.com$' -and $sourceUser -ceq "postgres.$reference"
 if(-not ($direct -or $pool)){throw 'CONNECT_TARGET_MISMATCH'}
 if(-not (Test-Path -LiteralPath $ca -PathType Leaf)){throw 'CA_MISSING'}
 $approval='BACKUP-DEV-ONLY';if($Resume){$approval='RESUME-READONLY-DEV'}
 if((Read-Host ('Confirm DrMAS-Dev/main and VeraCrypt V:; type '+$approval)) -cne $approval){throw 'NOT_CONFIRMED'}
 $drive=New-Object IO.DriveInfo 'V:\'
 if(-not $drive.IsReady -or $drive.AvailableFreeSpace -lt 64MB){throw 'BACKUP_SPACE_OR_VOLUME'}
 $suffix=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
 $out=Join-Path 'V:\' ('DrMAS-Dev-pre-reconnect-'+$suffix)
 if($Resume){$out=Join-Path $BackupDirectory ('resume-'+$suffix)}
 if(Test-Path -LiteralPath $out){throw 'OUTPUT_EXISTS'}
 New-Item -ItemType Directory -Path $out -ErrorAction Stop|Out-Null
 $env:PGSSLMODE='verify-full';$env:PGSSLROOTCERT=(Resolve-Path -LiteralPath $ca).Path;$env:PGCONNECT_TIMEOUT='15'
 $common=@('-h',$sourceHost,'-p','5432','-U',$sourceUser,'-d','postgres','-W')
 if($Resume){
  $stage='resume_archive_checks'
  $listExit=Invoke-NativeSafely "$pg\pg_restore.exe" @('--list',$saved.dump) "$out\archive-toc.private.txt"
  $fullExit=Invoke-NativeSafely "$pg\pg_restore.exe" @('--file=NUL',$saved.dump) "$out\archive-read.private.log"
  Write-NewJson "$out\archive-status.private.json" @{listExit=$listExit;readExit=$fullExit}
  if($listExit -ne 0 -or $fullExit -ne 0){throw 'ARCHIVE_CHECK_FAILED'}
  # Original files may have changed while the archive was being read: recheck locally.
  $rechecked=Read-ResumeArtifacts $BackupDirectory
  if($saved.hash -cne $rechecked.hash -or -not (Compare-Preservation $saved.before $rechecked.before)){throw 'RESUME_INPUT_CHANGED'}
  $stage='resume_dev_read_only_query'
  $after=Invoke-RecordedQuery $out $common "$PSScriptRoot\reconnect-data-preservation-readonly.sql"
  $same=Compare-Preservation $saved.before $after
  Write-NewJson "$out\resume-result.private.json" @{format='drmas-dev-backup-resume-v1';comparisonMatches=$same;backupChecks='pass';backupSha256=$saved.hash;originalPgDumpExit=0;immediatePostBackupStateProven=$false;subsequentWritesPossible=$true;restoreValidation='unverified-deferred';migrationApplied=$false;checkedAtUtc=[DateTime]::UtcNow.ToString('o')}
  if(-not $same){Write-Host 'FAIL RESUMED_STATE_DIFFERS; BACKUP_CHECKS_PASS; POSSIBLE_SUBSEQUENT_WRITES';exit 2}
  Write-Host 'PASS RESUME_READONLY_COMPARISON; NOT_IMMEDIATE_POST_BACKUP_PROOF; RESTORE_UNVERIFIED'
  Write-Host ('Private result folder: '+$out)
  exit 0
 }
 $stage='dev_read_only_before'
 $before=Invoke-RecordedQuery $out $common "$PSScriptRoot\reconnect-data-preservation-readonly.sql" 'before.private.json' 'before-query-status.private.json'
 if($before.format -ne 'drmas-reconnect-data-preservation-v1' -or -not $before.read_only -or $before.server_major -ne 17 -or $before.old_pair_constraint_count -ne 1 -or $before.new_index_present -or $before.closure_reason_present -or $before.rls_table_count -ne 4){throw 'DEV_BASELINE_MISMATCH'}
 $stage='pg_dump'
 $dump=Join-Path $out 'database.dump'
 $code=Invoke-NativeSafely "$pg\pg_dump.exe" @('-h',$sourceHost,'-p','5432','-U',$sourceUser,'--dbname=postgres','-W','--format=custom','--lock-wait-timeout=10s',('--file='+$dump)) "$out\dump.private.log"
 # Record the ACTUAL exit code, including failures, never infer from file existence.
 [IO.File]::WriteAllText("$out\pg_dump-exit.txt",[string]$code)
 if($code -ne 0){throw 'DUMP_FAILED_PARTIAL_FILE'}
 if(-not (Test-Path -LiteralPath $dump -PathType Leaf) -or (Get-Item -LiteralPath $dump).Length -eq 0){throw 'EMPTY_DUMP'}
 $digest=Get-ArchiveHash $dump
 [IO.File]::WriteAllText("$dump.sha256",$digest+'  database.dump'+[Environment]::NewLine)
 $stage='archive_checks'
 $listExit=Invoke-NativeSafely "$pg\pg_restore.exe" @('--list',$dump) "$out\archive-toc.private.txt"
 $fullExit=Invoke-NativeSafely "$pg\pg_restore.exe" @('--file=NUL',$dump) "$out\archive-read.private.log"
 if($listExit -ne 0 -or $fullExit -ne 0){throw 'ARCHIVE_CHECK_FAILED'}
 $stage='dev_read_only_after_backup'
 $after=Invoke-RecordedQuery $out $common "$PSScriptRoot\reconnect-data-preservation-readonly.sql" 'after-backup.private.json' 'after-query-status.private.json'
 if(-not (Compare-Preservation $before $after)){throw 'SOURCE_CHANGED_DURING_BACKUP'}
 $report=@{format='drmas-dev-backup-preparation-v1';pgDumpExit=0;archiveListExit=$listExit;archiveReadExit=$fullExit;sourceStable=$true;sqlHashMatch=$true;restoreValidation='unverified-deferred';migrationApplied=$false;backupSha256=$digest;createdAtUtc=[DateTime]::UtcNow.ToString('o')}
 [IO.File]::WriteAllText("$out\preparation.private.json",($report|ConvertTo-Json))
 Write-Host 'PASS LATEST_BACKUP_AND_READ_ONLY_SNAPSHOT; RESTORE_UNVERIFIED; MIGRATION_NOT_APPLIED'
 Write-Host ('Private result folder: '+$out)
} catch {
 Write-Host ('FAIL stage='+$stage+'; details suppressed; preserve any partial files; no migration authorized')
 exit 1
} finally {
 $env:PGSSLMODE=$oldMode;$env:PGSSLROOTCERT=$oldRoot;$env:PGCONNECT_TIMEOUT=$oldTimeout
}
