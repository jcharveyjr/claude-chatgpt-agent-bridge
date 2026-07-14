# Claude + ChatGPT Agent Bridge — Project Status

**Last updated:** July 14, 2026 (America/Chicago)  
**Current version:** 0.1.7  
**Overall status:** Local Windows MVP is complete, operational, and validated with real authenticated handoffs in both directions.

## Executive Summary

Agent Bridge is a vendor-neutral MCP task broker that allows Claude Code and Codex/ChatGPT agents to delegate bounded tasks to one another through a shared asynchronous queue.

The core local objective has been achieved. The broker is running on this Windows computer, both CLIs are connected to the same MCP endpoint, all automated checks pass, and real Claude-to-Codex and Codex-to-Claude tasks have completed successfully. Remaining work is primarily repository hygiene, CI/release automation, write-enabled acceptance testing, and optional hosted/web deployment.

## Sources of Truth

| Item | Location | Status |
| --- | --- | --- |
| Active Windows installation | `C:\Users\JC Harvey\Documents\AgentBridge` | Working v0.1.7 runtime |
| Public GitHub repository | `jcharveyjr/claude-chatgpt-agent-bridge` | Current source repository |
| Local MCP endpoint | `http://127.0.0.1:8787/mcp` | Healthy and connected |
| Local health endpoint | `http://127.0.0.1:8787/health` | Returns `ok: true` |
| Older downloaded copy | `C:\Users\JC Harvey\Downloads\claude-chatgpt-agent-bridge-0.1.1\claude-chatgpt-agent-bridge-0.1.1` | Stale v0.1.1 copy; do not use for new work |

Important: the active installation contains the current source and runtime files, but it is not presently a Git working tree because it has no `.git` directory. GitHub is therefore the authoritative version history.

## Current Runtime State

- Node.js: `v24.15.0`
- Claude Code: `2.1.207`
- Codex CLI: `0.144.3`
- Bridge version: `0.1.7`
- Default workspace: `bridge`, mapped to the active project directory
- Host and port: loopback-only `127.0.0.1:8787`
- Delegation depth limit: `2`
- Per-task character limit: `50,000`
- Claude and Codex worker timeout: `30 minutes`
- Windows sign-in startup entry: installed and active
- Claude MCP registration: connected
- Codex MCP registration: enabled

The task store currently contains three acceptance records: two completed bidirectional tasks and one historical failed Claude-to-Codex attempt. The failed record was caused by quoting a Windows path containing a space; that defect was corrected in later versions and the subsequent handoff passed.

## Completed Work

### Core broker and transports

- MCP server supports local stdio and Streamable HTTP.
- Persistent asynchronous task queue supports creation, status retrieval, filtering, and results.
- Interrupted running tasks are recovered after restart.
- Running tasks can be cancelled.
- Claude Code and Codex CLI worker adapters are implemented.
- Same-agent delegation, excessive nesting, and circular delegation are blocked.
- Read-only and workspace-write sandbox modes are supported.
- Named workspace allowlisting prevents arbitrary path access.

### Security and hosted readiness

- Local HTTP is bound to loopback by default.
- Static bearer authentication is available for controlled HTTP deployments.
- OAuth/JWT protected-resource validation is implemented for hosted connectors.
- Provider credentials are isolated between workers.
- Runtime configuration, task data, logs, and environment files are excluded from version control.

### Setup, documentation, and Windows support

- Repeatable local setup script installs dependencies, validates prerequisites, builds, tests, creates configuration, synchronizes skills, and registers both MCP clients.
- Shared delegation skills and plugin scaffolds exist for Claude and Codex.
- Start and stop scripts support a detached Windows broker.
- The bridge starts automatically at Windows sign-in.
- Windows launcher quoting, native Codex binary resolution, noninteractive approval behavior, prompt forwarding, sandbox shell resolution, and lingering worker-process handling have been corrected.
- README, tutorial, validation matrix, security guide, and Windows installation log are present.

### Real acceptance testing

- Codex-to-Claude authenticated read-only handoff completed successfully.
- Claude-to-Codex authenticated read-only handoff completed successfully.
- Neither acceptance task changed files.
- The final setup rerun passed after all Windows corrections.

## Verification Performed July 14, 2026

| Check | Result |
| --- | --- |
| Health endpoint | Passed |
| `npm run doctor` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 13 of 13 passed |
| `npm run build` | Passed |
| `npm run smoke:http` | Passed |
| Claude MCP connection | Connected |
| Codex MCP registration | Enabled |

## Recently Completed (July 14, 2026 — engineering iteration)

This iteration was reviewed and validated from a clean clone (`npm run typecheck`,
`npm test` = 13 of 13, `npm run build`, `npm run smoke:http` all pass).

- **`.env` auto-load** at startup (`src/cli.ts`, Node `process.loadEnvFile`,
  overridable via `AGENT_BRIDGE_ENV_FILE`). Closes the gap where `.env.example`
  documented variables that were never read.
- **Clear worker timeouts** — `runCommand` now rejects with
  `Command '<name>' timed out after <N> ms.` instead of a generic non-zero exit
  code, with test coverage.
- **Node DEP0190 fix** — the Windows worker spawn no longer passes an args array
  with `shell: true`; the command line is pre-composed and safely quoted
  (`buildWindowsShellCommand`, unit-tested). Pending live Windows validation.
- **CI** — `.github/workflows/ci.yml` (typecheck, test, build, smoke on Node 20 & 22).
- **Docs** — `CHANGELOG.md`, `RELEASE_NOTES-v0.1.7.md`,
  `docs/ACCEPTANCE-WORKSPACE-WRITE.md`, and `docs/HOSTED-DEPLOYMENT.md`.
- **`setup-local` omit=dev fix** — `scripts/setup-local.mjs` now installs
  devDependencies with `--include=dev`, so setup works even when npm is set to
  `omit=dev` or `NODE_ENV=production`.
- **Local development clone** established and validated on Windows (typecheck,
  13/13 tests, build all pass); see `docs/DEVELOPMENT.md`.
- **v0.1.7 released** — tag and GitHub Release published at
  https://github.com/jcharveyjr/claude-chatgpt-agent-bridge/releases/tag/v0.1.7
- **User guide** added: `docs/USER_GUIDE.md`.

## What Needs To Be Done

### Priority 0 — Establish a clean development workflow

1. **Create a proper Git working clone for ongoing development.**
   - Recommended: clone `jcharveyjr/claude-chatgpt-agent-bridge` into a new development folder.
   - Keep `bridge.config.json`, `.env`, and `.agent-bridge` local and uncommitted.
   - After validation, point the startup entry to the version-controlled installation or keep the runtime and source clone intentionally separate.
2. **Archive or delete the stale v0.1.1 Downloads copy** after confirming nothing unique remains in it.
3. **Add GitHub Actions CI** to run type checking, tests, and production build on pushes and pull requests. — DONE: `.github/workflows/ci.yml` runs typecheck, test, build, and the HTTP smoke test on Node 20 and 22 for pushes and pull requests.
4. **Create a tagged v0.1.7 release** with the Windows acceptance results and installation notes. — DONE: released as `v0.1.7` (https://github.com/jcharveyjr/claude-chatgpt-agent-bridge/releases/tag/v0.1.7); notes in `RELEASE_NOTES-v0.1.7.md`. Cut with a local `git tag` + `gh release create`.

### Priority 1 — Complete local production hardening

1. Run a real `workspace_write` handoff against a disposable test repository and verify the resulting diff, approvals, and test execution. — DOCUMENTED: step-by-step procedure and pass criteria in `docs/ACCEPTANCE-WORKSPACE-WRITE.md`; execute on a host with authenticated `claude`/`codex` CLIs.
2. Add at least one real development workspace to `bridge.config.json` when cross-agent coding is ready to begin.
3. Add log and task-store retention or rotation so `.agent-bridge` does not grow indefinitely.
4. Add a simple status command that reports broker health, PID, connected clients, queued tasks, and recent failures.
5. Review generated task records and logs before sharing or backing them up because delegated prompts and results may contain project information.
6. Resolve the Node deprecation warning in the Windows-aware command check without reintroducing launcher or quoting failures. — FIXED IN CODE: `src/adapters/command.ts` no longer passes an args array with `shell: true` (Node DEP0190); the Windows command line is pre-composed and safely quoted via `buildWindowsShellCommand`, with unit-test coverage. Validate the live Windows handoff before release.

### Priority 2 — Improve release quality

1. Add automated code coverage and define a minimum threshold.
2. Add tests for malformed worker output, large results, timeout recovery, store corruption, and concurrent task bursts.
3. Validate installation on macOS and Linux in addition to Windows.
4. Decide whether to publish an npm package, downloadable release archive, or installer; `package.json` is currently marked private.
5. Add changelog and versioning guidance for future releases. — DONE: `CHANGELOG.md` added (Keep a Changelog style).

### Priority 3 — Optional hosted and web integration

1. Deploy the HTTP broker behind public HTTPS. — GUIDE ADDED: `docs/HOSTED-DEPLOYMENT.md` documents the HTTPS + OAuth setup and the decisions required from the user.
2. Configure an OAuth issuer, audience, JWKS URL, scopes, and public protected-resource metadata.
3. Connect ChatGPT web/workspace surfaces through an approved remote MCP app or plugin.
4. Connect Claude web/Cowork through a remote custom connector.
5. Replace or supplement the JSON task store with a durable database before supporting multiple hosts or users.
6. Add hosted observability, rate limiting, backups, and deployment rollback procedures.

## Enhancement Backlog (Ideas)

Candidate improvements beyond the current MVP, grouped by theme. These are
options, not commitments.

### Reliability and scale
- Replace the JSON task store with SQLite for safe concurrency, richer queries,
  and multi-host readiness.
- Task and log retention/rotation so `.agent-bridge` does not grow without bound.
- Optional automatic retry on transient worker failures; idempotency keys on
  `delegate_task` to avoid duplicate submissions.
- Configurable per-agent concurrency (currently strictly serial per agent).

### Observability
- Structured JSON logging with levels.
- A `/metrics` endpoint (queue depth, task durations, success/failure rates).
- A `status` CLI subcommand (broker health, PID, connected clients, queued
  tasks, recent failures).
- A live task dashboard (Cowork artifact or a small web UI).

### Capabilities
- Additional worker adapters (for example Gemini CLI or local models via Ollama)
  through the existing generic command adapter.
- Task priorities and simple scheduling; task dependencies/chaining.
- File/artifact results, not just text.
- Completion webhooks/notifications (Slack, email).
- Optional post-write verification hook (auto-run tests after `workspace_write`).

### Security and hardening
- Per-client OAuth scopes mapped to allowed workspaces; rate limiting; audit log.
- Secret scanning of task text before dispatch to a worker.
- Containerized/sandboxed workers.

### Packaging and developer experience
- Add a Windows runner to CI so the Windows spawn path is exercised automatically
  (validates the DEP0190 fix on every push).
- Expand tests: malformed worker output, large results, timeout recovery, store
  corruption, concurrent bursts.
- Publish as an npm package / `npx`-runnable and/or a Docker image (the package is
  currently `private`).
- Cross-platform CI matrix (macOS and Windows in addition to Linux).

### Hosted and web
- Complete the public HTTPS + OAuth deployment (`docs/HOSTED-DEPLOYMENT.md`) to
  bring in ChatGPT Work and Claude web/Cowork.
- Multi-tenant support and a durable database before multi-user operation.

## Recommended Next Action

Use the public GitHub repository to create a clean local clone, add CI, and perform a write-enabled acceptance test in a disposable workspace. No additional user decision is required to begin those local engineering tasks.

A user decision is required before hosted deployment because it needs a public hostname, hosting provider, OAuth provider, and confirmation of which ChatGPT and Claude web/workspace features are available on the user's accounts.

## Suggested Agent Responsibilities

- **Codex:** source implementation, test expansion, CI workflow, operational scripts, packaging, and platform compatibility fixes.
- **Claude:** architecture and security review, documentation, threat modeling, acceptance criteria, and independent review of Codex changes.
- **Both:** use Agent Bridge only for bounded peer tasks; never recursively delegate a task received through the bridge.

## Resume Checklist

1. Read `README.md`, `AGENTS.md`, `CLAUDE.md`, `PROJECT_STATUS.md`, `CHANGELOG.md`, `RELEASE_NOTES-v0.1.7.md`, `docs/WINDOWS-INSTALL-LOG.md`, `docs/USER_GUIDE.md`, `docs/DEVELOPMENT.md`, `docs/ACCEPTANCE-WORKSPACE-WRITE.md`, and `docs/HOSTED-DEPLOYMENT.md`.
2. Confirm the active directory and avoid the stale Downloads copy.
3. Run:

```powershell
npm run doctor
npm run typecheck
npm test
npm run build
npm run smoke:http
```

4. Preserve workspace allowlists, delegation-depth limits, asynchronous tool behavior, and credential isolation.
5. Never commit `bridge.config.json`, `.env`, `.agent-bridge`, credentials, task records, or runtime logs.
6. After changing `skills/delegate-to-peer/SKILL.md`, run `npm run sync:skills`.
7. Use one shared HTTP broker for simultaneous Claude and Codex operation.