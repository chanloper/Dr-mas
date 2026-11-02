param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
$runtime=Join-Path $PSScriptRoot '.tools\node-v24.22.2-win-x64'
if(Test-Path (Join-Path $runtime 'node.exe')){$env:PATH="$runtime;$env:PATH"}
if(-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)){throw 'Install Node.js 24 LTS and reopen the terminal.'}
& npm.cmd @Arguments
exit $LASTEXITCODE
