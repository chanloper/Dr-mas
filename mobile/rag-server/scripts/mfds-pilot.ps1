[CmdletBinding()]
param(
    [switch]$Preflight,
    [ValidateSet(5, 20, 30, 40, 50)][int]$MaxRows = 5,
    [ValidateRange(1, 5)][int]$Pages = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptExitCode = 0
$savedEnvironment = @{}
$secret = $null
$secretPointer = [IntPtr]::Zero
$locationPushed = $false
$savedConsoleEncoding = [Console]::OutputEncoding
$savedOutputEncoding = $OutputEncoding

try {
    # Do not inherit Node debug/loader settings that could print request URLs.
    foreach ($variableName in @('DATA_GO_KR_SERVICE_KEY', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_OPTIONS')) {
        $savedEnvironment[$variableName] = [Environment]::GetEnvironmentVariable($variableName, 'Process')
    }
    foreach ($variableName in @('NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_OPTIONS')) {
        [Environment]::SetEnvironmentVariable($variableName, $null, 'Process')
    }
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $OutputEncoding = [Console]::OutputEncoding
    $projectDirectory = Split-Path -Parent $PSScriptRoot
    Push-Location -LiteralPath $projectDirectory
    $locationPushed = $true
    $nodeCommand = Get-Command node -ErrorAction Stop
    $cliPath = Join-Path $projectDirectory 'src\mfds-pilot.ts'
    $isBatch = $MaxRows -ne 5
    if ($isBatch) { $cliPath = Join-Path $projectDirectory 'src\mfds-batch.ts' }

    if ($Preflight) {
        if ($isBatch) { & $nodeCommand --import tsx $cliPath preflight "--max-rows=$MaxRows" }
        else { & $nodeCommand --import tsx $cliPath preflight }
        $scriptExitCode = $LASTEXITCODE
    } else {
        if ($isBatch) {
            $maxPages = [int]($MaxRows / 10)
            $pagesThisRun = [Math]::Min($Pages, $maxPages)
            $maxCalls = $maxPages * 3
            Write-Host "MFDS scale check: up to $MaxRows raw rows; 10 rows/page; at most $maxCalls HTTP attempts across resumes."
            Write-Host "Up to $pagesThisRun pages this invocation. Persistent deadline: 15 minutes from first start."
        } else { Write-Host 'MFDS e-drug pilot: pageNo=1, numOfRows=5, at most 3 HTTP attempts.' }
        Write-Host 'Timeout 10s/attempt; interval >=1.1s; response <=2,000,000 bytes.'
        Write-Host 'Local development storage only. Rights stay pending. No Gemini requests.'
        Write-Host 'Confirm your portal application is approved and authorize this real API call.'
        $confirmation = Read-Host "Type COLLECT $MaxRows to proceed; anything else cancels"
        if ($confirmation -cne "COLLECT $MaxRows") {
            Write-Host 'MFDS_PILOT_CANCELLED: no API request was made.'
            return
        }
        # Read-Host does not echo the key or place it in the command history.
        $secret = Read-Host 'Enter the decoded data.go.kr service key (hidden)' -AsSecureString
        if ($secret.Length -eq 0) { throw 'EMPTY_KEY' }
        $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        [Environment]::SetEnvironmentVariable('DATA_GO_KR_SERVICE_KEY', [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer), 'Process')
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
        $secretPointer = [IntPtr]::Zero
        $secret.Dispose()
        $secret = $null

        # The secret travels only through the child process environment, never argv.
        if ($isBatch) { & $nodeCommand --import tsx $cliPath collect "--max-rows=$MaxRows" "--pages=$pagesThisRun" --approve-live --portal-approved }
        else { & $nodeCommand --import tsx $cliPath collect --approve-live-max-5 --portal-approved }
        $scriptExitCode = $LASTEXITCODE
    }
} catch {
    # Never print $_, Exception, InvocationInfo, command lines or the environment.
    Write-Host 'MFDS_PILOT_SCRIPT_FAILED: check the safe CLI error code or local setup.'
    $scriptExitCode = 1
} finally {
    if ($secretPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
    if ($null -ne $secret) { $secret.Dispose() }
    foreach ($variableName in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($variableName, $savedEnvironment[$variableName], 'Process')
    }
    if ($locationPushed) { Pop-Location }
    [Console]::OutputEncoding = $savedConsoleEncoding
    $OutputEncoding = $savedOutputEncoding
}
if ($scriptExitCode -ne 0) { exit $scriptExitCode }
