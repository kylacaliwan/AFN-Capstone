$ErrorActionPreference = 'Stop'

$frontendDir = Split-Path -Parent $PSScriptRoot
$backendDir = Resolve-Path (Join-Path $frontendDir '..\backend')
$backendPython = Join-Path $backendDir 'venv\Scripts\python.exe'
$backendManage = Join-Path $backendDir 'manage.py'
$backendOutLog = Join-Path $frontendDir '.dev-backend.log'
$backendErrLog = Join-Path $frontendDir '.dev-backend.err.log'

if (-not (Test-Path $backendPython)) {
  throw "Backend Python was not found at '$backendPython'."
}

if (-not (Test-Path $backendManage)) {
  throw "Backend manage.py was not found at '$backendManage'."
}

if (Test-Path $backendOutLog) {
  Remove-Item -LiteralPath $backendOutLog -Force
}

if (Test-Path $backendErrLog) {
  Remove-Item -LiteralPath $backendErrLog -Force
}

$backendPort = $env:BACKEND_PORT
if (-not $backendPort) {
  $backendPort = '8001'
}

$frontendPort = $env:VITE_DEV_SERVER_PORT
if (-not $frontendPort) {
  $frontendPort = '5174'
}

$env:FRONTEND_BASE_URL = "http://localhost:$frontendPort"
$env:VITE_BACKEND_HOST = "http://127.0.0.1:$backendPort"
$env:VITE_DEV_SERVER_PORT = $frontendPort

Write-Host "Starting Django backend with project virtualenv..."
$backendProcess = Start-Process `
  -FilePath $backendPython `
  -ArgumentList @($backendManage, 'runserver', "127.0.0.1:$backendPort") `
  -WorkingDirectory $backendDir `
  -RedirectStandardOutput $backendOutLog `
  -RedirectStandardError $backendErrLog `
  -PassThru

Start-Sleep -Seconds 3

if ($backendProcess.HasExited) {
  $stdout = if (Test-Path $backendOutLog) { Get-Content -Path $backendOutLog -Raw } else { '' }
  $stderr = if (Test-Path $backendErrLog) { Get-Content -Path $backendErrLog -Raw } else { '' }
  throw "Backend exited before the frontend started.`n`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
}

Write-Host "Backend running on http://127.0.0.1:$backendPort"
Write-Host "Backend logs: $backendOutLog"
Write-Host "Starting Vite frontend on http://localhost:$frontendPort..."

try {
  Push-Location $frontendDir
  & npm.cmd run start:frontend
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
  if ($backendProcess -and -not $backendProcess.HasExited) {
    Write-Host "Stopping Django backend..."
    Stop-Process -Id $backendProcess.Id -Force
  }
}
