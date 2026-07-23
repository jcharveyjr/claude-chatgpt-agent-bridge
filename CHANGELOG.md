# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project aims to
follow semantic versioning.

## [Unreleased]

## [0.1.9] - 2026-07-23

### Security
- Updated the locked `fast-uri` dependency from 3.1.3 to 3.1.4, resolving the
  high-severity host-confusion advisory found during the v0.1.8 install audit.
- Documented the two remaining moderate `@hono/node-server` advisories. Agent
  Bridge does not import or call the affected `serveStatic` handler and remains
  loopback-only by default; a forced MCP SDK downgrade was not taken.

## [0.1.8] - 2026-07-23

### Added
- `agent-bridge status` subcommand reporting broker health, PID, endpoint,
  detected worker commands and readiness state, queue counts, task-store health,
  running tasks, recent failures, data directory, and retention config, with a
  `--json` flag. Instance fingerprints prevent mixed runtime/local reports.
- Configurable task-store retention (`retention.maxCompletedTasks`,
  `retention.maxTaskAgeDays`) enforced on startup and after every task so the
  store cannot grow without bound. Queued and running tasks are never pruned.
- Session log rotation on start, bounded by `retention.maxLogFiles`.
- Code-coverage thresholds via `npm run coverage`
  (line >= 70, branch >= 65, funcs >= 70) and a Node 22 CI coverage job.
- Repeatable acceptance harness `scripts/acceptance-harness.ps1`
  (`prepare` / `verify` / `cleanup`). Its Windows default uses Documents rather
  than a temp path that may resolve through a sandbox-blocked 8.3 short name.
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
- Documentation: `RELEASE_NOTES-v0.1.8.md`, updated validation and Windows
  acceptance evidence, the write-mode handoff procedure, development workflow,
  user guide, and hosted-deployment guidance.

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
  `shell: true`; the command line is pre-composed and safely quoted. Live
  Claude and Codex write-mode acceptance completed without DEP0190, quoting
  regressions, or leftover CLI workers.
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
