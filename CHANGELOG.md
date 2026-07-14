# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project aims to
follow semantic versioning.

## [Unreleased]

### Added
- `agent-bridge status` subcommand reporting broker health, PID, endpoint,
  worker availability, queue counts by status, running tasks, recent failures,
  data directory, and retention config, with a `--json` flag.
- Configurable task-store retention (`retention.maxCompletedTasks`,
  `retention.maxTaskAgeDays`) enforced on startup and after every task so the
  store cannot grow without bound. Queued and running tasks are never pruned.
- Session log rotation on start, bounded by `retention.maxLogFiles`.
- Code-coverage thresholds via `npm run coverage`
  (line >= 70, branch >= 65, funcs >= 70) and a Node 22 CI coverage job.
- Repeatable acceptance harness `scripts/acceptance-harness.ps1`
  (`prepare` / `verify` / `cleanup`).
- Expanded tests: process-tree cancellation, stdin/EPIPE robustness, large
  output, store corruption, retention (count + age), unknown workspace,
  permission-mode propagation, worker failure, concurrent bursts, and status.
- `.env` is auto-loaded at startup when present (Node `process.loadEnvFile`, no
  new dependencies). The path can be overridden with `AGENT_BRIDGE_ENV_FILE`.
  Closes the gap where `.env.example` documented variables that were never read.
- Test coverage for the worker command timeout path.
- GitHub Actions CI (`.github/workflows/ci.yml`) running type check, tests,
  build, and the HTTP smoke test on Node 20 and 22 for pushes and pull requests.
- `buildWindowsShellCommand` helper (exported) with unit-test coverage.
- Documentation: `CHANGELOG.md`, `RELEASE_NOTES-v0.1.7.md`,
  `docs/ACCEPTANCE-WORKSPACE-WRITE.md` (write-mode handoff procedure), and
  `docs/HOSTED-DEPLOYMENT.md` (public HTTPS + OAuth setup).

### Changed
- Worker timeout and cancellation now terminate the entire worker process tree
  (Windows `taskkill /T`, POSIX process group) with a force-kill escalation, so
  no worker (or its grandchildren) is left running. `stdin` is destroyed on
  settle to avoid a dangling-handle leak, and its `error` events are ignored.
- `doctor` no longer triggers Node DEP0190 on Windows.
- `npm test` runs with a 60s per-test timeout so a stuck test fails fast.
- Worker command timeouts now reject with an explicit
  `Command '<name>' timed out after <N> ms.` error instead of surfacing as a
  generic non-zero exit code, making a slow peer distinguishable from a crash.
- Windows worker spawn no longer passes an args array together with
  `shell: true`; the command line is pre-composed and safely quoted. This
  resolves Node's DEP0190 deprecation. (Validate on a Windows host before
  release; behavior on non-Windows platforms is unchanged.)
- `.env.example` documents the new auto-load behavior.

## [0.1.7] - 2026-07-13

### Added
- MCP task broker over local stdio and remote-capable Streamable HTTP.
- Persistent asynchronous task queue with create, status, filter, and result.
- Claude Code and Codex CLI worker adapters.
- Read-only and workspace-write sandbox modes with named-workspace allowlisting.
- Cancellation, restart recovery, nesting limits, and circular-delegation guards.
- Static bearer auth for local/private use and OAuth/JWT for hosted connectors.
- Shared Claude/Codex delegation skill and plugin scaffolds.
- Repeatable local setup script and Windows start/stop scripts.
- Automated protocol and queue tests; real bidirectional Windows handoffs.
