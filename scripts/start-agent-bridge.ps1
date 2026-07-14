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
