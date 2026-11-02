param([ValidateSet('embedding','generation')][string]$Mode='embedding')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'utf8-console.ps1')
$root=Split-Path $PSScriptRoot -Parent
$node=Join-Path $root '.tools\node-v24.22.2-win-x64\node.exe'
if(-not (Test-Path -LiteralPath $node)){$node=(Get-Command node.exe -ErrorAction Stop).Source}
if(Test-Path -LiteralPath (Join-Path $root '.smoke\first-attempt.json')) { throw 'One-call budget already reserved. No request sent.' }
if($Mode -eq 'generation' -and [string]::IsNullOrWhiteSpace($env:GEMINI_GENERATION_MODEL)){throw 'Set GEMINI_GENERATION_MODEL (non-secret model ID) first.'}
if(-not (Test-Path -LiteralPath $node)){throw 'Project Node runtime not found.'}
$secret=$null
$plain=$null
$ptr=[IntPtr]::Zero
$child=$null
$started=$false
$exitCode=1
try {
 $secret=Read-Host 'Gemini API key (hidden; never saved)' -AsSecureString
 if($secret.Length -eq 0){throw 'Key required.'}
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 $info=New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName=$node
 $info.Arguments="--import tsx src/smoke.ts $Mode"
 $info.StandardOutputEncoding=$utf8Encoding
 $info.StandardErrorEncoding=$utf8Encoding
 if($info.PSObject.Properties.Name -contains 'StandardInputEncoding'){$info.StandardInputEncoding=$utf8Encoding}
 $info.WorkingDirectory=$root
 $info.UseShellExecute=$false
 $info.CreateNoWindow=$true
 $info.RedirectStandardInput=$true
 $info.RedirectStandardOutput=$true
 $info.RedirectStandardError=$true
 # Key is passed only via stdin, never via command arguments or environment.
 foreach($name in @('GEMINI_API_KEY','GOOGLE_API_KEY','NODE_OPTIONS','NODE_DEBUG','SSLKEYLOGFILE')){ $info.EnvironmentVariables.Remove($name) }
 $child=New-Object System.Diagnostics.Process
 $child.StartInfo=$info
 [void]$child.Start()
 $started=$true
 $child.StandardInput.Write($plain)
 $child.StandardInput.Close()
 $plain=$null
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
 $ptr=[IntPtr]::Zero
 $secret.Dispose()
 $secret=$null
 $output=$child.StandardOutput.ReadToEndAsync()
 $errors=$child.StandardError.ReadToEndAsync()
 if(-not $child.WaitForExit(20000)){$child.Kill();throw 'Test timeout; budget remains reserved. Do not automatically retry.'}
 # Print only allowlisted fields from this program, never raw process errors.
 $result=$null
 try{$result=$output.Result | ConvertFrom-Json}catch{}
 if($child.ExitCode -eq 0 -and $result.mode -eq 'live' -and $result.mock -eq $false -and $result.apiCalls -eq 1){
   $exitCode=0
   [ordered]@{mode='live';mock=$false;status=$result.status;apiCalls=1;dimensions=$result.dimensions;outputCharacters=$result.outputCharacters} | ConvertTo-Json
 }else{Write-Host 'Live test NOT verified. Check model/key/quota/connectivity. No automatic retry; one-call budget remains reserved.'}
 if($child.ExitCode -ne 0){$exitCode=$child.ExitCode}
}finally{
 if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 $plain=$null
 if($secret){$secret.Dispose()}
 if($child){if($started -and -not $child.HasExited){$child.Kill()};$child.Dispose()}
}
exit $exitCode
