param([ValidateSet('test','check','quality','semantic','diagnose')][string]$Task='quality')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'utf8-console.ps1')
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
 switch($Task){
  'test' { & "$root\npm-local.cmd" test }
  'check' { & "$root\npm-local.cmd" run check }
  'quality' { & "$root\npm-local.cmd" run quality:mock }
  'semantic' { & "$root\npm-local.cmd" run semantic:mock }
  'diagnose' { & "$root\npm-local.cmd" run encoding:diagnose }
 }
 $result=$LASTEXITCODE
}finally{Pop-Location}
exit $result
