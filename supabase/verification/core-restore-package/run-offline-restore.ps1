# Windows PowerShell 5.1+. Default is read-only preflight; -Execute requires approval.
[CmdletBinding()]
param([switch]$Execute)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$private = 'V:\DrMAS-CoreRestore-Package-20261104'
$cluster = 'V:\DrMAS-CoreRestore-PG17-20261104'
$backup = 'V:\DrMAS-Dev-20261104-165001.dump'
$db = 'drmas_core_restore_verify'
$stage = 'preflight'
$ownedCluster = $false
$started = $false
$success = $false
$stopped = $true
$trackedPids = New-Object 'System.Collections.Generic.HashSet[int]'

function Test-IsolatedInterfaces([object[]]$Interfaces) {
    $up = @($Interfaces |
        Where-Object { $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and
            $_.NetworkInterfaceType -ne [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback })
    return ($up.Count -eq 0)
}
function Get-RequiredSpace([double]$PackageBytes) {
    return [Math]::Max([double](2GB), $PackageBytes * 20 + 1GB)
}
function Assert-Offline {
    if (-not (Test-IsolatedInterfaces @([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()))) {
        throw 'OFFLINE_NOT_CONFIRMED'
    }
}
function Get-PortListeners([int]$Port) {
    return @([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
        Where-Object { $_.Port -eq $Port })
}
function Get-ExistingSignature {
    $services = @(Get-CimInstance Win32_Service -ErrorAction Stop |
        Where-Object { $_.Name -match 'postgres' } |
        Sort-Object Name | Select-Object Name, State, PathName)
    $listeners = @(Get-PortListeners 55432 | ForEach-Object { $_.ToString() } | Sort-Object)
    return (ConvertTo-Json -Compress -Depth 4 -InputObject @{ Services=$services; Listeners=$listeners })
}
function Assert-VeraCrypt {
    # Query the Windows DOS-device mapping, not the volume label or a guessed CLI /list.
    if (-not ('DrMASDriveProbe' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DrMASDriveProbe {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern uint QueryDosDevice(string name, StringBuilder target, int size);
}
'@
    }
    $buffer = New-Object System.Text.StringBuilder 4096
    if ([DrMASDriveProbe]::QueryDosDevice('V:', $buffer, $buffer.Capacity) -eq 0) { throw 'V_MAPPING_UNAVAILABLE' }
    if ($buffer.ToString() -notmatch '^\\Device\\VeraCryptVolume(?:[A-Z]|\d+)$') { throw 'V_NOT_VERACRYPT_DEVICE' }
    $driver = @(Get-CimInstance Win32_SystemDriver -Filter "Name='veracrypt'" -ErrorAction Stop |
        Where-Object { $_.State -eq 'Running' })
    if ($driver.Count -ne 1) { throw 'VERACRYPT_DRIVER_UNCONFIRMED' }
    $drive = New-Object System.IO.DriveInfo 'V:\'
    if (-not $drive.IsReady -or $drive.DriveType -eq [System.IO.DriveType]::Network) { throw 'V_NOT_LOCAL_READY' }
    # Conservative floor, not an estimate based only on the compressed dump size.
    $packageBytes = (Get-ChildItem -LiteralPath $private -File -ErrorAction Stop |
        Measure-Object Length -Sum).Sum
    $required = Get-RequiredSpace ([double]$packageBytes)
    if ($drive.AvailableFreeSpace -lt $required) {
        Write-Host ('FAIL V_CAPACITY totalBytes={0} freeBytes={1} requiredBytes={2}' -f
            $drive.TotalSize, $drive.AvailableFreeSpace, [long]$required)
        throw 'V_INSUFFICIENT_FREE_SPACE'
    }
    Write-Host ('PASS V_CAPACITY totalBytes={0} freeBytes={1} requiredBytes={2}' -f
        $drive.TotalSize, $drive.AvailableFreeSpace, [long]$required)
}
function Assert-Package {
    $manifest = Get-Content -LiteralPath "$private\manifest.private.json" -Raw | ConvertFrom-Json
    if ($manifest.format -ne 'drmas-core-restore-package-v1') { throw 'MANIFEST_FORMAT' }
    $hash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $manifest.backupSha256) { throw 'BACKUP_HASH_CHANGED' }
    $sidecar = (Get-Content -LiteralPath ($backup + '.sha256') -Raw).Trim()
    if ($sidecar -cne ($hash + '  ' + [IO.Path]::GetFileName($backup))) { throw 'CHECKSUM_SIDECAR_MISMATCH' }
    foreach ($entry in $manifest.files.PSObject.Properties) {
        if ([IO.Path]::GetFileName($entry.Name) -ne $entry.Name) { throw 'MANIFEST_PATH' }
        $path = Join-Path $private $entry.Name
        $item = Get-Item -LiteralPath $path -ErrorAction Stop
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REPARSE_ARTIFACT' }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value) {
            throw 'PACKAGE_HASH_CHANGED'
        }
    }
    $root = Get-Item -LiteralPath $private -ErrorAction Stop
    if (($root.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REPARSE_PRIVATE_ROOT' }
}
function Assert-RemainingSpace {
    $drive = New-Object System.IO.DriveInfo 'V:\'
    if (-not $drive.IsReady -or $drive.AvailableFreeSpace -lt 512MB) { throw 'SPACE_SAFETY_RESERVE' }
}
function Write-NewAscii([string]$Path, [string]$Text) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes=[Text.Encoding]::ASCII.GetBytes($Text); $stream.Write($bytes,0,$bytes.Length) }
    finally { $stream.Dispose() }
}
function Initialize-SafeNativeRunner {
    if ('DrMASSafeNative' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
public static class DrMASSafeNative {
 public class Result {
  public int ExitCode = -1;
  public bool ExitObserved = false;
  public string Diagnostic = "UNKNOWN";
 }
 // Windows argv escaping; passwords are NEVER arguments or captured input.
 static string Quote(string value) {
  var b = new StringBuilder("\""); int slashes=0;
  foreach(char c in value) {
   if(c=='\\') { slashes++; continue; }
   if(c=='"') { b.Append('\\',slashes*2+1); b.Append(c); slashes=0; continue; }
   b.Append('\\',slashes); slashes=0; b.Append(c);
  }
  b.Append('\\',slashes*2); b.Append('"'); return b.ToString();
 }
 public static Result RunDetailed(string exe, string[] args, string log) {
  var result=new Result(); string phase="OUTPUT_IO";
  try {
  var quoted=new string[args.Length];
  for(int i=0;i<args.Length;i++) quoted[i]=Quote(args[i]);
  var info=new ProcessStartInfo(exe,string.Join(" ",quoted));
  info.UseShellExecute=false; info.CreateNoWindow=false;
  info.RedirectStandardOutput=true; info.RedirectStandardError=true;
  info.RedirectStandardInput=false; // native hidden console password input remains native
  info.EnvironmentVariables["LC_ALL"]="C"; info.EnvironmentVariables["LANG"]="C";
  using(var output=new FileStream(log,FileMode.CreateNew,FileAccess.Write,FileShare.None))
  using(var process=new Process()) {
   process.StartInfo=info; phase="NATIVE_START";
   if(!process.Start()) throw new Exception("NATIVE_START_FAILED");
   phase="OUTPUT_IO";
   var stdout=process.StandardOutput.BaseStream.CopyToAsync(output);
   var stderr=Task.Run(()=> {
    var tail=new StringBuilder(); int c;
    string[] prompts={"Password: ","Password for user postgres: ","Enter new superuser password: ","Enter it again: "};
    while((c=process.StandardError.Read())!=-1) {
     tail.Append((char)c); if(tail.Length>512) tail.Remove(0,tail.Length-512);
     string signal=tail.ToString().ToLowerInvariant();
     // Fixed diagnostic categories only. Raw text, usernames and hostnames never escape.
     if(signal.Contains("password authentication failed") || signal.Contains("no password supplied") || signal.Contains("28p01")) result.Diagnostic="AUTH";
     else if(signal.Contains("certificate verify failed") || signal.Contains("root certificate") || signal.Contains("ssl error") || signal.Contains("ssl connection") || signal.Contains("does not match host name")) result.Diagnostic="TLS";
     else if(signal.Contains("connection timed out") || signal.Contains("timeout expired")) result.Diagnostic="CONNECT_TIMEOUT";
     else if(signal.Contains("could not translate host name") || signal.Contains("connection refused") || signal.Contains("network is unreachable") || signal.Contains("server closed the connection")) result.Diagnostic="CONNECTIVITY";
     else if(signal.Contains("57014") || signal.Contains("55p03") || signal.Contains("statement timeout") || signal.Contains("lock timeout")) result.Diagnostic="SQL_TIMEOUT";
     else if(signal.Contains("42501") || signal.Contains("permission denied")) result.Diagnostic="SQL_PERMISSION";
     else if(result.Diagnostic=="UNKNOWN" && (signal.Contains("error:") || signal.Contains("fatal:"))) result.Diagnostic="SQL_OR_CONNECTION_ERROR";
     foreach(string prompt in prompts) if(tail.ToString().EndsWith(prompt,StringComparison.Ordinal)) {
      Console.Error.Write("Local password (hidden input): "); tail.Clear(); break;
     }
     // Session-pooler usernames include the project reference; do not print it.
     if(System.Text.RegularExpressions.Regex.IsMatch(tail.ToString(),@"Password for user [A-Za-z0-9_.-]{1,64}: $")) {
      Console.Error.Write("Local password (hidden input): "); tail.Clear();
     }
    }
    // All other stderr is discarded, never printed or saved; even a failed SQL
    // statement can embed a value in its message despite terse verbosity.
   });
   process.WaitForExit(); result.ExitCode=process.ExitCode; result.ExitObserved=true;
   Task.WaitAll(stdout,stderr);
   if(result.ExitCode==0 && result.Diagnostic=="UNKNOWN") result.Diagnostic="NONE";
   return result;
  }
  } catch { result.Diagnostic=phase; return result; }
 }
 public static int Run(string exe, string[] args, string log) {
  var result=RunDetailed(exe,args,log);
  if(!result.ExitObserved || result.Diagnostic=="OUTPUT_IO" || result.Diagnostic=="NATIVE_START") throw new Exception("NATIVE_SAFE_FAILURE");
  return result.ExitCode;
 }
}
'@
}
function Invoke-NativeSafely([string]$Exe, [string[]]$Arguments, [string]$Log) {
    Initialize-SafeNativeRunner
    return [DrMASSafeNative]::Run($Exe,$Arguments,$Log)
}
function Invoke-NativeDiagnostic([string]$Exe, [string[]]$Arguments, [string]$Log) {
    Initialize-SafeNativeRunner
    return [DrMASSafeNative]::RunDetailed($Exe,$Arguments,$Log)
}
function Invoke-Step([string]$Name, [string]$Exe, [string[]]$Arguments) {
    $script:stage=$Name
    Assert-Offline
    Assert-RemainingSpace
    # Only fixed password prompt text may reach stderr; arbitrary native errors
    # never reach console/logs. Password input remains in the native console.
    Write-Host ('PASS READY_{0}; enter local password only if prompted' -f $Name)
    $code=Invoke-NativeSafely $Exe $Arguments "$private\$Name.private.log"
    Assert-Offline
    if ($code -ne 0) { throw 'NATIVE_STEP_FAILED' }
    Write-Host ('PASS {0}' -f $Name)
}
function Remember-ClusterProcesses {
    if (-not (Test-Path -LiteralPath "$cluster\postmaster.pid" -PathType Leaf)) { return }
    $lines=Get-Content -LiteralPath "$cluster\postmaster.pid"
    if ($lines.Count -lt 4 -or [IO.Path]::GetFullPath($lines[1]) -ne $cluster -or $lines[3] -ne '55433') {
        throw 'PID_FILE_TARGET_MISMATCH'
    }
    [void]$trackedPids.Add([int]$lines[0])
    $processes=@(Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" -ErrorAction Stop)
    for ($i=0;$i -lt $processes.Count;$i++) {
        foreach ($p in $processes) {
            if ($trackedPids.Contains([int]$p.ParentProcessId)) { [void]$trackedPids.Add([int]$p.ProcessId) }
        }
    }
}
function Stop-OwnedCluster {
    if (-not $ownedCluster) { return $true }
    try {
        Remember-ClusterProcesses
        if (Test-Path -LiteralPath "$cluster\postmaster.pid") {
            $stopExitCode=Invoke-NativeSafely "$pgBin\pg_ctl.exe" @('-D',$cluster,'-w','-t','30','-m','fast','stop') "$private\shutdown.private.log"
            if ($stopExitCode -ne 0) { return $false }
        }
        if (@(Get-PortListeners 55433).Count -ne 0 -or (Test-Path -LiteralPath "$cluster\postmaster.pid")) { return $false }
        foreach ($trackedProcessId in $trackedPids) {
            if (Get-Process -Id $trackedProcessId -ErrorAction SilentlyContinue) { return $false }
        }
        return $true
    } catch { return $false }
}

try {
    # Ignore no inherited libpq targeting/settings/secret variables silently.
    foreach ($name in @('PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','PGPASSFILE')) {
        if (Test-Path -LiteralPath "Env:$name") { throw 'UNEXPECTED_LIBPQ_ENVIRONMENT' }
    }
    if (-not (Test-Path -LiteralPath $private -PathType Container)) { throw 'PRIVATE_PACKAGE_MISSING' }
    Assert-VeraCrypt
    Assert-Package
    Assert-Offline
    if (Test-Path -LiteralPath $cluster) { throw 'CLUSTER_PATH_ALREADY_EXISTS' }
    if (@(Get-PortListeners 55433).Count -ne 0) { throw 'PORT_55433_IN_USE' }
    foreach ($name in @('initdb','pg_ctl','createdb','psql')) {
        if (-not (Test-Path -LiteralPath "$pgBin\$name.exe" -PathType Leaf)) { throw 'PG_TOOL_MISSING' }
        $version = & "$pgBin\$name.exe" --version
        if ($LASTEXITCODE -ne 0 -or $version -notmatch '\b17\.') { throw 'PG_MAJOR_MISMATCH' }
    }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $baseline = Get-ExistingSignature
    if (@(Get-PortListeners 55432).Count -eq 0) { throw 'EXISTING_55432_NOT_CONFIRMED' }
    foreach ($f in @('restore-exit.txt','export-exit.txt','actual-catalog.private.json',
        'initdb.private.log','start.private.log','createdb.private.log','restore.private.log',
        'export.private.log','verify.private.log','postgres.private.log','shutdown.private.log')) {
        if (Test-Path -LiteralPath "$private\$f") { throw 'RUN_ARTIFACT_ALREADY_EXISTS' }
    }
    Write-Host 'PASS READ_ONLY_PREFLIGHT'
    if (-not $Execute) {
        Write-Host 'PASS PREFLIGHT_ONLY; NO_CLUSTER_OR_DB_CREATED'
        exit 0
    }
    $answer = Read-Host 'Confirm V: in VeraCrypt GUI and approved offline restore; type APPROVE-LOCAL-PARTIAL-RESTORE'
    if ($answer -cne 'APPROVE-LOCAL-PARTIAL-RESTORE') { throw 'EXECUTION_NOT_CONFIRMED' }
    Assert-Offline
    # All writes below are to the new fixed V: cluster/private outputs, never 55432.
    Invoke-Step 'initdb' "$pgBin\initdb.exe" @('-D',$cluster,'-U','postgres','-W','--encoding=UTF8','--auth-host=scram-sha-256','--auth-local=scram-sha-256')
    $ownedCluster=$true
    $stopped=$false
    Invoke-Step 'start' "$pgBin\pg_ctl.exe" @('-D',$cluster,'-l',"$private\postgres.private.log",'-w','-t','30','-o','-h 127.0.0.1 -p 55433','start')
    $started=$true
    Remember-ClusterProcesses
    $listeners=@(Get-PortListeners 55433)
    if ($listeners.Count -ne 1 -or $listeners[0].Address.ToString() -ne '127.0.0.1') { throw 'LISTENER_NOT_LOOPBACK_ONLY' }
    Invoke-Step 'createdb' "$pgBin\createdb.exe" @('-h','127.0.0.1','-p','55433','-U','postgres','-W','--template=template0',$db)
    Assert-Package
    $common=@('-X','-q','-W','-h','127.0.0.1','-p','55433','-U','postgres','-d',$db,'-v','ON_ERROR_STOP=1')
    Invoke-Step 'restore' "$pgBin\psql.exe" ($common + @('-f',"$private\restore.private.sql"))
    Write-NewAscii "$private\restore-exit.txt" "0`r`n"
    Remember-ClusterProcesses
    Invoke-Step 'export' "$pgBin\psql.exe" ($common + @('-f',"$private\export-catalog.private.sql",'-o',"$private\actual-catalog.private.json"))
    Write-NewAscii "$private\export-exit.txt" "0`r`n"
    Invoke-Step 'verify' $node @((Join-Path $PSScriptRoot 'verify.cjs'),$private,'after')
    if (-not (Select-String -LiteralPath "$private\verify.private.log" -Pattern '^CORE_DATA_PARTIAL_RESTORE_PASS$' -Quiet)) {
        throw 'FINAL_PASS_MARKER_MISSING'
    }
    if ((Get-ExistingSignature) -ne $baseline) { throw 'EXISTING_CLUSTER_STATE_CHANGED' }
    $success=$true
} catch {
    # Never echo exceptions/native command arguments, input data or environment values.
    $reason='DETAILS_SUPPRESSED'
    $allowed=@('OFFLINE_NOT_CONFIRMED','V_MAPPING_UNAVAILABLE','V_NOT_VERACRYPT_DEVICE',
        'VERACRYPT_DRIVER_UNCONFIRMED','V_NOT_LOCAL_READY','V_INSUFFICIENT_FREE_SPACE',
        'MANIFEST_FORMAT','BACKUP_HASH_CHANGED','CHECKSUM_SIDECAR_MISMATCH','MANIFEST_PATH',
        'REPARSE_ARTIFACT','PACKAGE_HASH_CHANGED','REPARSE_PRIVATE_ROOT','SPACE_SAFETY_RESERVE',
        'NATIVE_STEP_FAILED','PID_FILE_TARGET_MISMATCH','UNEXPECTED_LIBPQ_ENVIRONMENT',
        'PRIVATE_PACKAGE_MISSING','CLUSTER_PATH_ALREADY_EXISTS','PORT_55433_IN_USE',
        'PG_TOOL_MISSING','PG_MAJOR_MISMATCH','EXISTING_55432_NOT_CONFIRMED',
        'RUN_ARTIFACT_ALREADY_EXISTS','EXECUTION_NOT_CONFIRMED','LISTENER_NOT_LOOPBACK_ONLY',
        'FINAL_PASS_MARKER_MISSING','EXISTING_CLUSTER_STATE_CHANGED')
    if ($allowed -ccontains $_.Exception.Message) { $reason=$_.Exception.Message }
    Write-Host ('FAIL stage={0} reason={1}; retain private artifacts' -f $stage,$reason)
} finally {
    if ($ownedCluster) { $stopped=Stop-OwnedCluster }
    if ($stopped) { Write-Host 'PASS RESTORE_55433_STOPPED_OR_NEVER_STARTED' }
    else { Write-Host 'FAIL STOP_UNCONFIRMED; KEEP_NETWORK_OFFLINE_AND_V_MOUNTED' }
}
if ($success -and $stopped) {
    Write-Host 'PASS CORE_DATA_PARTIAL_RESTORE; FULL_SUPABASE_AND_REAL_JWT_UNVERIFIED'
    exit 0
}
exit 1
