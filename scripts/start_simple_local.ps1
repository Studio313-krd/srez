param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$previewRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$previewLogs = Join-Path $previewRoot '.local'
$previewPython = Join-Path $previewRoot '.venv\Scripts\python.exe'
$previewNode = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $previewPython)) { throw 'Install backend dependencies in .venv first.' }
New-Item -ItemType Directory -Path $previewLogs -Force | Out-Null

function Test-Preview([int]$Port) {
    try {
        $session = Invoke-RestMethod "http://127.0.0.1:$Port/api/session/" -TimeoutSec 2
        return $session.local_preview -eq $true
    } catch { return $false }
}
function Start-PreviewProcess([string]$Name, [string]$File, [string[]]$Arguments) {
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $previewRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $previewLogs "$Name.out.log") -RedirectStandardError (Join-Path $previewLogs "$Name.err.log")
    $process.Id | Set-Content (Join-Path $previewLogs "$Name.pid")
    return $process
}
function Wait-Preview([int]$Port, $Process) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-Preview $Port) { return }
        if ($Process.HasExited) { throw "Local process exited. Check $previewLogs logs." }
        Start-Sleep -Milliseconds 500
    }
    throw "Port $Port did not become ready. Check $previewLogs logs."
}
function Assert-PreviewPort([int]$Port) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listener -and -not (Test-Preview $Port)) { throw "Port $Port is occupied by another service. It was not changed." }
}
Assert-PreviewPort 8098
if (-not (Test-Preview 8098)) {
    $apiProcess = Start-PreviewProcess 'simple-api' $previewPython @('-X','utf8','scripts/run_simple_local.py')
    Wait-Preview 8098 $apiProcess
}
Assert-PreviewPort 8099
if (-not (Test-Preview 8099)) {
    $uiProcess = Start-PreviewProcess 'simple-ui' $previewNode @('node_modules/vite/bin/vite.js','--config','vite.local.config.ts')
    Wait-Preview 8099 $uiProcess
}
$workerProcess = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object {
    $_.ExecutablePath -eq $previewPython -and $_.CommandLine -match 'run_simple_local\.py.*--worker'
}
if (-not $workerProcess) {
    Start-PreviewProcess 'simple-worker' $previewPython @('-X','utf8','scripts/run_simple_local.py','--worker') | Out-Null
}
Write-Host 'Local preview is ready: http://localhost:8099/'
Write-Host 'Separate local data. Telegram and MAX sending disabled.'
if (-not $NoBrowser) { Start-Process 'http://localhost:8099/' }
