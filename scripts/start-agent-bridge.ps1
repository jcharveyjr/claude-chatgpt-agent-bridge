param(
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$healthUrl = "http://127.0.0.1:8787/health"
$dataDirectory = Join-Path $root ".agent-bridge"
$pidFile = Join-Path $dataDirectory "bridge.pid"
$stdoutLog = Join-Path $dataDirectory "bridge.stdout.log"
$stderrLog = Join-Path $dataDirectory "bridge.stderr.log"

# Keep a bounded number of prior-session logs (retention.maxLogFiles, default 5).
$maxLogFiles = 5
try {
  $cfg = Get-Content (Join-Path $root "bridge.config.json") -Raw -ErrorAction Stop | ConvertFrom-Json
  if ($cfg.retention.maxLogFiles) { $maxLogFiles = [int]$cfg.retention.maxLogFiles }
} catch { }

function Invoke-LogRotation($path, $maxFiles) {
  if (-not (Test-Path $path)) { return }
  $oldest = "$path.$maxFiles"
  if (Test-Path $oldest) { Remove-Item -LiteralPath $oldest -Force }
  for ($i = $maxFiles - 1; $i -ge 1; $i--) {
    $src = "$path.$i"
    if (Test-Path $src) { Move-Item -LiteralPath $src -Destination "$path.$($i + 1)" -Force }
  }
  Move-Item -LiteralPath $path -Destination "$path.1" -Force
}

try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  if ($health.ok) {
    Write-Output "Agent Bridge is already healthy at $healthUrl"
    exit 0
  }
} catch {
  # The bridge is not running yet.
}

if (-not (Test-Path (Join-Path $root "dist\src\cli.js"))) {
  Push-Location $root
  try { npm run build } finally { Pop-Location }
}

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
# Archive the previous session's logs before they are overwritten.
Invoke-LogRotation $stdoutLog $maxLogFiles
Invoke-LogRotation $stderrLog $maxLogFiles
$node = (Get-Command node -ErrorAction Stop).Source

if ($Foreground) {
  Push-Location $root
  try { & $node "dist/src/cli.js" "http" } finally { Pop-Location }
  exit $LASTEXITCODE
}

$process = Start-Process -FilePath $node `
  -ArgumentList @("dist/src/cli.js", "http") `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.ok) {
      Write-Output "Agent Bridge started (PID $($process.Id)) at $healthUrl"
      exit 0
    }
  } catch {
    # Keep waiting for the listener.
  }
}

if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
$tail = if (Test-Path $stderrLog) { Get-Content $stderrLog -Tail 20 | Out-String } else { "" }
throw "Agent Bridge did not become healthy. $tail"
