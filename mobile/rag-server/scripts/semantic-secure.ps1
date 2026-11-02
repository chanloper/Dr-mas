param([switch]$ApproveLive)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'utf8-console.ps1')
$root=Split-Path $PSScriptRoot -Parent
if(-not $ApproveLive){throw 'Explicit approval required: -ApproveLive permits at most THREE embedding requests.'}
$node=Join-Path $root '.tools\node-v24.22.2-win-x64\node.exe'
if(-not (Test-Path -LiteralPath $node)){$node=(Get-Command node.exe -ErrorAction Stop).Source}
if(Test-Path -LiteralPath (Join-Path $root 'data\semantic-live\attempt.json')){throw 'Three-call trial already reserved. No request sent.'}
if(-not (Test-Path -LiteralPath $node)){throw 'Project Node runtime not found.'}
Push-Location $root
try {
 $preview=& $node --import tsx src/semantic-check.ts
 if($LASTEXITCODE -ne 0){throw 'Mock preflight failed. No live request sent.'}
 $mockResult=$preview | ConvertFrom-Json
 if($mockResult.mock -ne $true -or -not $mockResult.semanticSearchPassed){throw 'Mock preflight failed.'}
 Write-Host 'Mock preflight passed. Live budget: 2 document + 1 query embeddings; no retries; synthetic data only; estimated-cost cap USD 0.001 at documented pricing.'
}finally{Pop-Location}
$secret=$null;$plain=$null;$ptr=[IntPtr]::Zero;$child=$null;$started=$false;$exitCode=1
try {
 $secret=Read-Host 'Gemini API key (hidden; never saved)' -AsSecureString
 if($secret.Length -eq 0){throw 'Key required.'}
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 $info=New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName=$node
 $info.Arguments='--import tsx src/semantic-check.ts --live --approve-3-calls'
 $info.StandardOutputEncoding=$utf8Encoding
 $info.StandardErrorEncoding=$utf8Encoding
 if($info.PSObject.Properties.Name -contains 'StandardInputEncoding'){$info.StandardInputEncoding=$utf8Encoding}
 $info.WorkingDirectory=$root
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 foreach($name in @('GEMINI_API_KEY','GOOGLE_API_KEY','NODE_OPTIONS','NODE_DEBUG','SSLKEYLOGFILE')){$info.EnvironmentVariables.Remove($name)}
 $child=New-Object System.Diagnostics.Process
 $child.StartInfo=$info
 [void]$child.Start();$started=$true
 $child.StandardInput.Write($plain);$child.StandardInput.Close();$plain=$null
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$ptr=[IntPtr]::Zero
 $secret.Dispose();$secret=$null
 $output=$child.StandardOutput.ReadToEndAsync();$errors=$child.StandardError.ReadToEndAsync()
 if(-not $child.WaitForExit(45000)){$child.Kill();throw 'Timeout. Three-call budget remains reserved; do not retry automatically.'}
 $result=$null;try{$result=$output.Result | ConvertFrom-Json}catch{}
 if(($child.ExitCode -eq 0 -or $child.ExitCode -eq 2) -and $result.mode -eq 'live' -and $result.mock -eq $false -and $result.actualEmbeddingCalls -eq 3){
   $exitCode=$child.ExitCode
   $result | Select-Object mode,mock,status,costControl,actualEmbeddingCalls,semanticSearchPassed,embeddingSettings,limits,inputCharacters,vectorThreshold,thresholdCalibrated,indexing,keywordOnly,question,expectedDocumentId,hits,rankings | ConvertTo-Json -Depth 12
 }else{Write-Host 'Live semantic search NOT verified. Up to 3 requests may have been sent; no automatic retry. Inspect non-secret usage in data/semantic-live/state.json.'}
 if($child.ExitCode -ne 0){$exitCode=$child.ExitCode}
}finally{
 if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 $plain=$null;if($secret){$secret.Dispose()}
 if($child){if($started -and -not $child.HasExited){$child.Kill()};$child.Dispose()}
}
exit $exitCode
