<#
.SYNOPSIS
  Repeatable harness for the workspace_write acceptance test.

.DESCRIPTION
  Automates everything AROUND the cross-vendor handoff. The delegation itself
  still requires an authenticated worker CLI and must be run by the operator
  between the 'prepare' and 'verify' steps.

  Steps:
    prepare  Create a disposable Git repo, a temporary loopback bridge config on
             a non-production port, build if needed, and start a test broker.
    verify   Check the exact expected output file, capture Git status/diff, and
             report leftover worker processes.
    cleanup  Stop the test broker and remove all temporary files.

.EXAMPLE
  ./scripts/acceptance-harness.ps1 -Step prepare
  # ... run the delegate_task MCP call it prints ...
  ./scripts/acceptance-harness.ps1 -Step verify
  ./scripts/acceptance-harness.ps1 -Step cleanup
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('prepare', 'verify', 'cleanup')]$Step,
  [int]$Port = 39787,
  [string]$Root = (Join-Path $env:TEMP 'agent-bridge-acceptance'),
  [string]$Expected = 'HELLO_BRIDGE'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$repoDir = Join-Path $Root 'repo'
$configPath = Join-Path $Root 'bridge.config.json'
$statePath = Join-Path $Root 'state.json'
$healthUrl = "http://127.0.0.1:$Port/health"
$outputFile = Join-Path $repoDir 'hello.txt'

function Write-Section($text) { Write-Host "== $text ==" -ForegroundColor Cyan }

if ($Step -eq 'prepare') {
  Write-Section 'prepare'
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  if (Test-Path $repoDir) { Remove-Item $repoDir -Recurse -Force }
  New-Item -ItemType Directory -Path $repoDir -Force | Out-Null

  Push-Location $repoDir
  try {
    git init -q
    git config user.email 'acceptance@example.invalid'
    git config user.name 'Acceptance Harness'
    Set-Content -LiteralPath (Join-Path $repoDir 'README.md') -Value "# scratch" -Encoding ascii
    git add -A; git commit -qm 'seed'
  } finally { Pop-Location }

  $config = @{
    dataDirectory    = (Join-Path $Root '.agent-bridge')
    defaultWorkspace = 'accept'
    workspaces       = @{ accept = $repoDir }
    http             = @{ host = '127.0.0.1'; port = $Port; allowedOrigins = @('https://chatgpt.com', 'https://claude.ai') }
  }
  # Write without a BOM; Node's JSON.parse rejects a UTF-8 BOM.
  [System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 6))

  if (-not (Test-Path (Join-Path $projectRoot 'dist/src/cli.js'))) {
    Push-Location $projectRoot; try { npm run build } finally { Pop-Location }
  }

  $node = (Get-Command node -ErrorAction Stop).Source
  $stdout = Join-Path $Root 'broker.stdout.log'
  $stderr = Join-Path $Root 'broker.stderr.log'
  $env:AGENT_BRIDGE_CONFIG = $configPath
  $proc = Start-Process -FilePath $node -ArgumentList @('dist/src/cli.js', 'http') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

  $healthy = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 400
    try { if ((Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2).ok) { $healthy = $true; break } } catch { }
  }
  if (-not $healthy) {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    throw "Test broker did not become healthy on port $Port. See $stderr"
  }

  @{ port = $Port; repoDir = $repoDir; configPath = $configPath; brokerPid = $proc.Id } |
    ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8

  Write-Host "Broker healthy (PID $($proc.Id)) at $healthUrl" -ForegroundColor Green
  Write-Host "Now run this delegate_task MCP call from Claude or Codex:" -ForegroundColor Yellow
  Write-Host "  target_agent:    codex   (or claude)"
  Write-Host "  source_agent:    claude  (or codex)"
  Write-Host "  workspace:       accept"
  Write-Host "  mode:            workspace_write"
  Write-Host "  task:            Create hello.txt containing the text $Expected and nothing else."
  Write-Host "  success_criteria: [hello.txt exists, content is exactly $Expected]"
  Write-Host "Poll get_task until completed, then run: acceptance-harness.ps1 -Step verify"
  exit 0
}

if ($Step -eq 'verify') {
  Write-Section 'verify'
  if (-not (Test-Path $statePath)) { throw "No state file; run -Step prepare first." }
  $fail = $false

  if (Test-Path $outputFile) {
    $content = (Get-Content -LiteralPath $outputFile -Raw).Trim()
    if ($content -eq $Expected) { Write-Host "PASS  hello.txt content == $Expected" -ForegroundColor Green }
    else { Write-Host "FAIL  hello.txt content == '$content' (expected '$Expected')" -ForegroundColor Red; $fail = $true }
  } else {
    Write-Host "FAIL  hello.txt was not created (no worker result yet?)" -ForegroundColor Red; $fail = $true
  }

  Write-Section 'git status --porcelain'
  Push-Location $repoDir; try { git status --porcelain; Write-Section 'git diff'; git --no-pager diff } finally { Pop-Location }

  Write-Section 'leftover worker processes (informational)'
  Get-Process node, codex, claude -ErrorAction SilentlyContinue |
    Select-Object Id, ProcessName, StartTime | Format-Table -Auto

  if ($fail) { Write-Host "Acceptance NOT satisfied." -ForegroundColor Red; exit 1 }
  Write-Host "Acceptance output verified." -ForegroundColor Green
  exit 0
}

if ($Step -eq 'cleanup') {
  Write-Section 'cleanup'
  if (Test-Path $statePath) {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $p = Get-Process -Id $state.brokerPid -ErrorAction SilentlyContinue
    if ($p) { Stop-Process -Id $state.brokerPid -Force; Write-Host "Stopped test broker PID $($state.brokerPid)" }
  }
  if (Test-Path $Root) { Remove-Item $Root -Recurse -Force }
  Write-Host "Removed $Root" -ForegroundColor Green
  Write-Section 'remaining worker processes (should not include the test broker)'
  Get-Process node, codex, claude -ErrorAction SilentlyContinue | Select-Object Id, ProcessName | Format-Table -Auto
  exit 0
}
