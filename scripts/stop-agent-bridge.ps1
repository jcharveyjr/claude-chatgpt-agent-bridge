$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root ".agent-bridge\bridge.pid"

if (-not (Test-Path $pidFile)) {
  Write-Output "No Agent Bridge PID file was found."
  exit 0
}

$bridgePid = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-Process -Id $bridgePid -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $bridgePid -Force
  Write-Output "Agent Bridge process $bridgePid was stopped."
} else {
  Write-Output "Agent Bridge process $bridgePid was not running."
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
