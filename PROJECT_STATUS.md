# Claude + ChatGPT Agent Bridge — Project Status

**Last updated:** July 14, 2026 (America/Chicago)  
**Current version:** 0.1.7  
**Overall status:** Local Windows MVP is complete, operational, and validated with real authenticated handoffs in both directions. The responsibility matrix and execution plan below are approved as the project plan.

## Executive Summary

Agent Bridge is a vendor-neutral MCP task broker that allows Claude Code and Codex/ChatGPT agents to delegate bounded tasks to one another through a shared asynchronous queue.

The core local objective has been achieved. The broker is running on this Windows computer, both CLIs are connected to the same MCP endpoint, all automated checks pass, and real Claude-to-Codex and Codex-to-Claude read-only tasks have completed successfully.

The clean development clone, CI workflow, v0.1.7 release, changelog, user guide, hosted-deployment guide, and write-acceptance procedure are complete. The primary remaining local work is live Windows validation of the latest command-spawn fix, execution and review of a real write-enabled acceptance test, operational hardening, expanded automated testing, and selection of the first real project workspace.

## Sources of Truth

| Item | Location | Status |
| --- | --- | --- |
| Active Windows installation | `C:\Users\JC Harvey\Documents\AgentBridge` | Working v0.1.7 runtime |
| Public GitHub repository | `jcharveyjr/claude-chatgpt-agent-bridge` | Authoritative source repository |
| Local MCP endpoint | `http://127.0.0.1:8787/mcp` | Healthy and connected |
| Local health endpoint | `http://127.0.0.1:8787/health` | Returns `ok: true` |
| Older downloaded copy | `C:\Users\JC Harvey\Downloads\claude-chatgpt-agent-bridge-0.1.1\claude-chatgpt-agent-bridge-0.1.1` | Stale v0.1.1 copy; do not use for new work |

The active runtime directory and the clean Git development clone may intentionally remain separate until the newer development build completes live Windows validation. GitHub is the authoritative version history.

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
- README, tutorial, validation matrix, security guide, user guide, development guide, hosted-deployment guide, write-acceptance guide, changelog, release notes, and Windows installation log are present.

### Real acceptance testing

- Codex-to-Claude authenticated read-only handoff completed successfully.
- Claude-to-Codex authenticated read-only handoff completed successfully.
- Neither acceptance task changed files.
- The final setup rerun passed after the original Windows corrections.

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

## Recently Completed — July 14, 2026 Engineering Iteration

This iteration was reviewed and validated from a clean clone. Type checking, all 13 tests, the production build, and the HTTP smoke test pass.

- **Environment loading:** startup now loads `.env` through Node's `process.loadEnvFile`, with `AGENT_BRIDGE_ENV_FILE` available as an override.
- **Clear worker timeouts:** `runCommand` reports the command name and configured timeout rather than only a generic non-zero exit code.
- **Node DEP0190 code fix:** Windows worker spawning no longer passes an argument array with `shell: true`; the command line is safely pre-composed through the tested `buildWindowsShellCommand` function. Live Windows handoff validation remains pending.
- **Continuous integration:** `.github/workflows/ci.yml` runs typecheck, tests, build, and HTTP smoke tests on Node 20 and Node 22.
- **Documentation:** `CHANGELOG.md`, `RELEASE_NOTES-v0.1.7.md`, `docs/ACCEPTANCE-WORKSPACE-WRITE.md`, `docs/HOSTED-DEPLOYMENT.md`, `docs/DEVELOPMENT.md`, and `docs/USER_GUIDE.md` were added.
- **Local setup correction:** `scripts/setup-local.mjs` explicitly installs development dependencies even when npm is configured with `omit=dev` or `NODE_ENV=production`.
- **Clean development clone:** a proper local Git development clone was established and validated on Windows.
- **v0.1.7 release:** the `v0.1.7` tag and GitHub Release were published.

## Official Execution Plan

This section is the approved plan for completing and expanding Agent Bridge. The working local Windows runtime remains the baseline and must stay operational until replacement runtime changes are validated.

### Ownership model

- **ChatGPT/Codex leads implementation.** This includes source code, tests, CI, scripts, configuration changes, packaging, release preparation, and platform fixes.
- **Claude provides independent review.** This includes architecture, security, threat modeling, documentation quality, acceptance criteria, and review of material ChatGPT/Codex changes.
- **JC owns product and access decisions.** JC is not expected to write code. User action is limited to approvals, selecting real workspaces, authenticating external services, and deciding whether the project remains local or becomes a distributed or hosted product.
- **Delegation remains bounded.** Neither agent may recursively delegate a task received through Agent Bridge.

### Responsibility matrix

| Work item | Priority | Status | Primary owner | Reviewer or support | JC action required | Completion condition |
| --- | --- | --- | --- | --- | --- | --- |
| Maintain the clean Git development clone | Immediate | Completed; ongoing discipline | ChatGPT/Codex | Claude may review structure | None | Development occurs in a version-controlled clone and all checks remain green |
| Preserve local secrets and runtime data outside version control | Immediate | In effect | ChatGPT/Codex | Claude reviews isolation | None | `.env`, `bridge.config.json`, `.agent-bridge`, credentials, and logs remain uncommitted |
| Inspect the stale v0.1.1 Downloads copy and archive or delete it | Immediate | Not started | ChatGPT/Codex | None | Approve permanent deletion after inspection | Nothing unique remains and the obsolete copy is removed from normal use |
| Maintain GitHub Actions CI | Immediate | Completed | ChatGPT/Codex | Claude reviews release controls | None | Pushes and pull requests continue to run required checks automatically |
| Publish the tagged v0.1.7 release | Immediate | Completed | ChatGPT/Codex | Claude reviews notes | None | Tag and release notes document validation and known limits |
| Validate the DEP0190 spawn fix through a live Windows handoff | High | Pending live validation | ChatGPT/Codex | Claude checks regression risk | None | Live Claude and Codex handoffs complete without the deprecation warning or quoting regressions |
| Run a real `workspace_write` handoff in a disposable repository | High | Procedure documented; execution pending | ChatGPT/Codex | Claude reviews security, tests, and resulting diff | None | Both directions make bounded changes, run tests, and produce an auditable diff |
| Add a real development workspace to `bridge.config.json` | High | Awaiting project selection | ChatGPT/Codex | Claude reviews permissions | Select the first real project to enable | Workspace is explicitly allowlisted with minimum necessary access |
| Add task-store and log retention or rotation | High | Not started | ChatGPT/Codex | Claude reviews privacy impact | None | Runtime data cannot grow indefinitely and retention behavior is documented |
| Add a status command for health, PID, clients, queue, and failures | High | Not started | ChatGPT/Codex | Claude reviews operational usefulness | None | One command reports actionable bridge state |
| Review task records and logs for sensitive-content handling | High | Not started | Claude | ChatGPT/Codex applies findings | None | Storage, backup, sharing, and cleanup guidance protects delegated information |
| Add automated coverage reporting and a minimum threshold | Medium | Not started | ChatGPT/Codex | Claude reviews meaningful coverage | None | CI reports coverage and enforces an agreed baseline |
| Add malformed-output, large-result, timeout-recovery, corruption, and concurrency tests | Medium | Partially started through timeout tests | ChatGPT/Codex | Claude identifies missing cases | None | Critical failure modes have repeatable automated tests |
| Validate installation on macOS and Linux | Medium | Not started | ChatGPT/Codex | Claude reviews cross-platform assumptions | Provide access only if no suitable environment is available | Installation and acceptance results are documented for each platform |
| Maintain changelog and versioning guidance | Medium | Changelog completed; process remains ongoing | ChatGPT/Codex | Claude reviews documentation | None | Every future release follows a consistent version and change-record process |
| Choose the distribution model | Medium | Decision pending | JC | ChatGPT and Claude provide recommendations | Choose source-only, ZIP, installer, npm package, Docker image, hosted service, or another format | Packaging work has a defined target |
| Build the selected package or installer | Medium | Blocked by distribution decision | ChatGPT/Codex | Claude reviews installation and security | None after JC's decision | Selected artifact installs cleanly and passes acceptance checks |
| Decide whether to pursue hosted and web deployment | Optional | Decision pending | JC | ChatGPT and Claude provide tradeoffs | Approve scope, intended users, and budget | A documented local-only or hosted direction is selected |
| Deploy a public HTTPS broker | Optional | Guide completed; deployment not started | ChatGPT/Codex | Claude reviews architecture and threat model | Approve hosting provider, hostname, and cost | Broker is securely reachable through HTTPS with rollback available |
| Configure hosted OAuth and connector access | Optional | Not started | ChatGPT/Codex | Claude reviews authentication boundaries | Authenticate accounts and approve provider choices | OAuth validation and connector access work end to end |
| Connect ChatGPT web and Claude web/Cowork | Optional | Not started | ChatGPT and Claude | Each agent validates its own integration | Authorize account access where required | Both web surfaces can submit and retrieve bounded bridge tasks |
| Add a durable database, observability, rate limits, backups, and rollback | Optional | Not started | ChatGPT/Codex | Claude reviews production readiness | Approve hosted scope and cost | Hosted system meets the agreed reliability and security standard |

### JC responsibilities

JC is responsible for decisions and authorization, not implementation:

1. Approve permanent deletion of the obsolete v0.1.1 Downloads copy after ChatGPT confirms that it contains nothing unique.
2. Select the first real project that Claude and ChatGPT may modify through an allowlisted workspace.
3. Choose the eventual distribution format: GitHub source, downloadable ZIP, Windows installer, npm package, Docker image, hosted service, or another approved format.
4. Decide whether Agent Bridge should remain a local personal tool or proceed to hosted and web deployment.
5. For hosted deployment, approve the hosting provider, public hostname, OAuth provider, intended users, and budget, then authenticate any required accounts.

### ChatGPT/Codex responsibilities

ChatGPT/Codex owns the implementation track:

1. Preserve the working runtime while developing in the clean Git clone.
2. Perform live Windows validation of the latest process-spawn changes.
3. Execute controlled write-enabled acceptance testing.
4. Implement status, retention, warning, test, coverage, packaging, and cross-platform improvements.
5. Keep changes small, testable, documented, and suitable for Claude's independent review.
6. Prepare future releases and apply findings from Claude's reviews.

### Claude responsibilities

Claude owns the independent review track:

1. Review write-enabled delegation, filesystem isolation, workspace restrictions, and permission boundaries.
2. Review credential isolation, environment handling, task records, logs, retention, backup, and sharing risks.
3. Threat-model recursive delegation, prompt injection, malicious task content, task-store exposure, hosted authentication, and multi-user operation.
4. Review material pull requests, tests, documentation, acceptance criteria, and release notes.
5. Identify missing architectural and failure-mode tests before future releases are considered complete.
6. Confirm that published documentation matches actual behavior and limitations.

### Decision gates

#### Gate A — Work that can proceed without JC input

ChatGPT/Codex may proceed with live Windows validation, the disposable write test, the status command, retention, sensitive-data improvements, expanded tests, coverage, cross-platform preparation, and future release maintenance. Claude should review the security-sensitive and release-sensitive portions.

#### Gate B — JC approval or selection required

JC input is required before permanent deletion of the stale copy, before granting write access to a real project, and before selecting a packaging or distribution target.

#### Gate C — Hosted deployment decision required

No hosted deployment work should begin beyond architecture, documentation, and recommendations until JC approves the hosted scope, users, provider, hostname, OAuth approach, and expected cost.

### Execution order

1. **ChatGPT/Codex:** validate the current development build through live Windows read-only handoffs and confirm that the DEP0190 fix introduces no regression.
2. **ChatGPT/Codex:** create or use a disposable repository and run bidirectional `workspace_write` acceptance tests according to `docs/ACCEPTANCE-WORKSPACE-WRITE.md`.
3. **Claude:** review write-mode security, workspace isolation, task records, logs, tests, and resulting diffs.
4. **ChatGPT/Codex:** apply review findings and implement retention, status reporting, expanded tests, and coverage.
5. **JC:** select the first real workspace and the desired distribution direction.
6. **ChatGPT/Codex and Claude:** proceed with real-project enablement, packaging, cross-platform validation, or hosted deployment according to JC's decisions.

## Current Next Action

Begin Gate A by validating the latest development build on Windows and executing the documented disposable write-enabled acceptance test. The current working runtime must remain available until those tests pass and Claude completes the security review.

## Enhancement Backlog

Candidate improvements beyond the required execution plan are options, not current commitments.

### Reliability and scale

- Replace the JSON task store with SQLite for safe concurrency, richer queries, and multi-host readiness.
- Add optional automatic retry for transient worker failures and idempotency keys for `delegate_task`.
- Add configurable per-agent concurrency; workers are currently serial per agent.

### Observability

- Add structured JSON logging with levels.
- Add a `/metrics` endpoint for queue depth, task duration, and success or failure rates.
- Add a live task dashboard through a small web UI or supported artifact surface.

### Capabilities

- Add worker adapters for other CLIs or local models through the generic command adapter.
- Add task priorities, scheduling, dependencies, and controlled chaining.
- Support file and artifact results in addition to text.
- Add completion notifications through approved channels.
- Add an optional post-write verification hook that automatically runs project tests after a `workspace_write` task.

### Security and hardening

- Map per-client OAuth scopes to allowed workspaces.
- Add rate limiting and an audit log.
- Add secret scanning of task text before worker dispatch.
- Add optional containerized or otherwise isolated workers.

### Packaging and developer experience

- Add a Windows CI runner so the Windows spawn path is exercised on every relevant push.
- Add macOS and Windows to the broader CI matrix.
- Publish an npm, `npx`, ZIP, installer, Docker, or other artifact after JC chooses the distribution model.

### Hosted and web

- Complete public HTTPS and OAuth deployment to connect ChatGPT web/workspace and Claude web/Cowork surfaces.
- Add multi-tenant support and a durable database before multi-user operation.

## Resume Checklist

1. Read `README.md`, `AGENTS.md`, `CLAUDE.md`, `PROJECT_STATUS.md`, `CHANGELOG.md`, `RELEASE_NOTES-v0.1.7.md`, `docs/WINDOWS-INSTALL-LOG.md`, `docs/USER_GUIDE.md`, `docs/DEVELOPMENT.md`, `docs/ACCEPTANCE-WORKSPACE-WRITE.md`, and `docs/HOSTED-DEPLOYMENT.md`.
2. Confirm the active runtime directory and the clean development clone; avoid the stale Downloads copy.
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
8. Do not replace the known-good runtime until live Windows validation and the write-enabled acceptance test pass.