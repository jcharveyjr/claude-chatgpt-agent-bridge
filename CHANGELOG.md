# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project aims to
follow semantic versioning.

## [Unreleased]

### Added
- Task-store retention/rotation. Finished (completed/failed/cancelled) tasks are
  pruned by age and total count; queued and running tasks are never removed.
  Configurable via `retention.maxTasks` (default 1000) and `retention.maxAgeDays`
  (default 90), or the `AGENT_BRIDGE_RETENTION_MAX_TASKS` /
  `AGENT_BRIDGE_RETENTION_MAX_AGE_DAYS` environment variables. Pruning runs at
  startup and after each completed task. `TaskStore.prune`/`TaskStore.stats`
  have unit-test coverage.
- `status` command (`npm run status`, or `node dist/src/cli.js status`) that
  reports process (PID, Node version, uptime), HTTP config and live health
  reachability, configured workspaces and limits, per-agent availability, queue
  counts by status and target agent, and recent failures. Task contents are
  deliberately excluded from the snapshot; only IDs, agents, timestamps, and a
  truncated error message are reported.
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
