$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$node=Join-Path $root '.tools\node-v24.22.2-win-x64\node.exe'
if(-not (Test-Path -LiteralPath $node)){$node=(Get-Command node.exe -ErrorAction Stop).Source}
$utf8=New-Object Text.UTF8Encoding($false)
$expected=[string][char]0xC7A0+[char]0xB4E4+[char]0xAE30+[char]0xAC00+' '+[char]0xD798+[char]0xB4E4+[char]0xC5B4+[char]0xC694
$legacyReproduced=$null
try {
 [Console]::OutputEncoding=[Text.Encoding]::GetEncoding(949)
 function Read-Wire([bool]$Fixed){
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$node;$info.Arguments='test/fixtures/encoding-wire.mjs';$info.WorkingDirectory=$root
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true
  if($Fixed){$info.StandardOutputEncoding=$utf8}
  $child=[Diagnostics.Process]::Start($info)
  try{$parsed=$child.StandardOutput.ReadToEnd() | ConvertFrom-Json;$child.WaitForExit();return $parsed.question -ceq $expected}finally{$child.Dispose()}
 }
 $legacyReproduced=-not (Read-Wire $false)
 $explicitUtf8Preserved=Read-Wire $true
}finally{[Console]::OutputEncoding=$utf8}
Push-Location $root
try {
 $OutputEncoding=[Text.Encoding]::ASCII
 $legacyInput=$expected | & $node test/fixtures/encoding-wire.mjs echo | ConvertFrom-Json
 $OutputEncoding=$utf8
 $fixedInput=$expected | & $node test/fixtures/encoding-wire.mjs echo | ConvertFrom-Json
}finally{Pop-Location}
[ordered]@{powerShellVersion=$PSVersionTable.PSVersion.ToString();legacyCp949OutputCorruptionReproduced=$legacyReproduced;explicitUtf8OutputPreserved=$explicitUtf8Preserved;asciiStdinCorruptionReproduced=(-not $legacyInput.matches);utf8StdinPreserved=$fixedInput.matches} | ConvertTo-Json
if(-not $explicitUtf8Preserved -or -not $fixedInput.matches){exit 1}
