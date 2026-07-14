# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project aims to
follow semantic versioning.

## [Unreleased]

### Added
- `.env` is auto-loaded at startup when present (Node `process.loadEnvFile`, no
  new dependencies). The path can be overridden with `AGENT_BRIDGE_ENV_FILE`.
  Closes the gap where `.env.example` documented variables that were never read.
- Test coverage for the worker command timeout path.

### Changed
- Worker command timeouts now reject with an explicit
  `Command '<name>' timed out after <N> ms.` error instead of surfacing as a
  generic non-zero exit code, making a slow peer distinguishable from a crash.
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
