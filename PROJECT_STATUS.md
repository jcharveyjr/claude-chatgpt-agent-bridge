# Claude + ChatGPT Agent Bridge — Project Status

**Last updated:** July 17, 2026 (America/Chicago)  
**Current version:** 0.1.7  
**Overall status:** Local Windows MVP is complete and operational. Claude is temporarily the primary implementation agent while Codex is quota-blocked. Codex-dependent live acceptance steps remain pending and have not been marked complete.

## Executive Summary

Agent Bridge is a vendor-neutral MCP task broker that allows Claude Code and Codex/ChatGPT agents to delegate bounded tasks to one another through a shared asynchronous queue.

The core local objective has been achieved. The broker is running on this Windows computer, both CLIs are connected to the same MCP endpoint, all automated checks pass, and real Claude-to-Codex and Codex-to-Claude read-only tasks have completed successfully.

The clean development clone, CI workflow, v0.1.7 release, changelog, user guide, hosted-deployment guide, and write-acceptance procedure are complete. The primary remaining local work is live Windows validation of the latest command-spawn fix, execution and review of a real write-enabled acceptance test, operational hardening, and expanded automated testing.

## Decisions Locked In — July 17, 2026

JC has made the four pending product and access decisions. These are no longer open:

1. **Stale v0.1.1 Downloads copy:** deletion is approved. Removal is gated only on ChatGPT confirming the copy contains nothing unique.
2. **First real write-enabled workspace:** the Agent Bridge project itself, allowlisted via the clean development clone (not the active known-good runtime). This dogfoods the bridge on its own codebase.
3. **Distribution model:** ship a versioned ZIP of the built runtime first, then a Windows installer that wraps `scripts/setup-local.mjs`; an `npx`-runnable package is a candidate later add, not a commitment.
4. **Hosting:** remain local-only for now. Hosted and web deployment may be revisited once a successful local model is available and worth hosting.

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

## Codex Acceptance Attempt — July 14, 2026

ChatGPT launched Codex CLI `0.144.3` from the clean development clone with `workspace-write` access limited to the repository and the disposable directory `C:\Users\JC Harvey\Documents\AgentBridge-accept`. Codex was instructed to complete execution-plan steps 1 and 2, update the acceptance records, run the full verification suite, and commit the resulting changes without pushing.

Codex initialized successfully but terminated before performing any project work because the connected Codex account had reached its usage limit. The CLI reported that usage becomes available again on **July 20, 2026 at 7:41 PM**.

Verified outcome:

- No live handoff was run against the latest command-spawn fix.
- No `workspace_write` task was submitted or completed.
- No task IDs or acceptance diffs were produced.
- No source, test, or documentation changes were made by Codex.
- The disposable directory was created, but no acceptance result may be recorded as passed.
- Steps 1 and 2 remain **Pending — blocked by external Codex usage quota**.

This is an account-capacity blocker, not a discovered Agent Bridge defect. The tests must be rerun after Codex access is restored. Claude may begin static architecture and security review now, but final acceptance review must wait for the live handoff evidence and write-test diffs.

## Official Execution Plan

This section is the approved plan for completing and expanding Agent Bridge. The working local Windows runtime remains the baseline and must stay operational until replacement runtime changes are validated.

### Ownership model

- **Claude temporarily leads implementation while Codex is quota-blocked.** Claude owns source changes, tests, CI, scripts, operational hardening, documentation, packaging preparation, and platform fixes that do not require a live Codex worker.
- **ChatGPT coordinates and verifies.** ChatGPT maintains the execution plan, directs work, runs Windows and repository checks through available tools, reviews Claude's changes, synchronizes local and GitHub copies, and preserves the known-good runtime.
- **Codex is temporarily limited to provider-specific validation after access resets.** Codex must later prove its real authenticated read-only and `workspace_write` worker paths and independently review material Claude changes.
- **JC owns product and access decisions.** JC is not expected to write code. User action is limited to approvals, selecting real workspaces, authenticating external services, and deciding whether the project remains local or becomes a distributed or hosted product.
- **Delegation remains bounded.** Neither agent may recursively delegate a task received through Agent Bridge.

### Responsibility matrix

| Work item | Priority | Status | Primary owner | Reviewer or support | JC action required | Completion condition |
| --- | --- | --- | --- | --- | --- | --- |
| Maintain the clean Git development clone | Immediate | Completed; ongoing discipline | Claude | ChatGPT verifies repository state | None | Development occurs in a version-controlled clone and all checks remain green |
| Preserve local secrets and runtime data outside version control | Immediate | In effect | Claude | ChatGPT verifies Git status; Codex reviews later | None | `.env`, `bridge.config.json`, `.agent-bridge`, credentials, and logs remain uncommitted |
| Inspect the stale v0.1.1 Downloads copy and archive or delete it | Immediate | Deletion approved by JC (July 17); pending ChatGPT inspection | ChatGPT | Claude may compare contents | Done — deletion approved | Nothing unique remains and the obsolete copy is removed from normal use |
| Maintain GitHub Actions CI | Immediate | Completed | Claude | ChatGPT verifies workflow results; Codex reviews later | None | Pushes and pull requests continue to run required checks automatically |
| Publish and maintain releases | Immediate | v0.1.7 completed | Claude | ChatGPT verifies release state; Codex reviews later | None | Release notes document validation evidence and known limits accurately |
| Validate the DEP0190 spawn fix through a live Windows handoff | High | Pending; Codex path blocked by usage quota until July 20, 2026 at 7:41 PM | ChatGPT/Codex | Claude prepares and reviews test evidence | None | Live Claude and Codex handoffs complete without the deprecation warning or quoting regressions |
| Run real bidirectional `workspace_write` handoffs in a disposable repository | High | Procedure ready; Codex side blocked by usage quota | ChatGPT/Codex | Claude prepares automation and reviews security and diffs | None | Both directions make bounded changes, run tests, pass guardrail checks, and produce an auditable diff |
| Add a real development workspace to `bridge.config.json` | High | Selected (July 17): Agent Bridge repo via clean dev clone; allowlisting not yet applied | Claude | ChatGPT verifies permissions; Codex reviews later | Done — workspace selected | Clean-clone workspace is explicitly allowlisted with minimum necessary access |
| Add task-store and log retention or rotation | High | Not started | Claude | ChatGPT verifies behavior; Codex reviews later | None | Runtime data cannot grow indefinitely and retention behavior is documented |
| Add a status command for health, PID, clients, queue, and failures | High | Not started | Claude | ChatGPT performs live Windows verification | None | One command reports actionable bridge state |
| Review and harden sensitive-content handling in task records and logs | High | Not started | Claude | ChatGPT verifies implementation; Codex reviews later | None | Storage, backup, sharing, redaction, and cleanup behavior protects delegated information |
| Add automated coverage reporting and a minimum threshold | Medium | Not started | Claude | ChatGPT verifies CI; Codex reviews later | None | CI reports coverage and enforces an agreed baseline |
| Add malformed-output, large-result, timeout-recovery, corruption, and concurrency tests | Medium | Partially started through timeout tests | Claude | ChatGPT verifies test execution; Codex reviews later | None | Critical failure modes have repeatable automated tests |
| Validate installation on macOS and Linux | Medium | Not started | Claude | ChatGPT coordinates environments; Codex reviews platform assumptions later | Provide access only if no suitable environment is available | Installation and acceptance results are documented for each platform |
| Maintain changelog and versioning guidance | Medium | Changelog completed; process remains ongoing | Claude | ChatGPT verifies release documentation | None | Every future release follows a consistent version and change-record process |
| Choose the distribution model | Medium | Decided (July 17): ZIP first, then Windows installer; npx package a possible later add | JC | ChatGPT and Claude provide recommendations | Done — model chosen | Packaging work has a defined target |
| Build the selected package or installer | Medium | Blocked by distribution decision | Claude | ChatGPT verifies installation; Codex reviews later | None after JC's decision | Selected artifact installs cleanly and passes acceptance checks |
| Decide whether to pursue hosted and web deployment | Optional | Decided (July 17): local-only for now; revisit after a successful local model | JC | ChatGPT and Claude provide tradeoffs | Done — local-only direction selected | A documented local-only or hosted direction is selected |
| Deploy a public HTTPS broker | Optional | Guide completed; deployment not started | Claude | ChatGPT coordinates access and verifies; Codex reviews later | Approve hosting provider, hostname, and cost | Broker is securely reachable through HTTPS with rollback available |
| Configure hosted OAuth and connector access | Optional | Not started | Claude | ChatGPT coordinates authentication and verifies; Codex reviews later | Authenticate accounts and approve provider choices | OAuth validation and connector access work end to end |
| Connect ChatGPT web and Claude web/Cowork | Optional | Not started | ChatGPT and Claude | Each agent validates its own integration; Codex validates CLI path later | Authorize account access where required | Both web surfaces can submit and retrieve bounded bridge tasks |
| Add a durable database, observability, rate limits, backups, and rollback | Optional | Not started | Claude | ChatGPT verifies operations; Codex reviews later | Approve hosted scope and cost | Hosted system meets the agreed reliability and security standard |

### JC responsibilities

JC is responsible for decisions and authorization, not implementation. As of July 17, 2026, decisions 1–4 below are made (see "Decisions Locked In"); item 5 remains open only if hosting is later pursued.

1. **Decided:** Permanent deletion of the obsolete v0.1.1 Downloads copy is approved, pending ChatGPT's confirmation that it contains nothing unique.
2. **Decided:** The first real write-enabled workspace is the Agent Bridge project itself, allowlisted via the clean development clone.
3. **Decided:** Distribution is a versioned ZIP first, then a Windows installer wrapping `setup-local.mjs`; `npx` package is a possible later add.
4. **Decided:** Agent Bridge remains a local personal tool for now; hosted and web deployment may be revisited after a successful local model exists.
5. **Open (only if hosting is pursued):** approve the hosting provider, public hostname, OAuth provider, intended users, and budget, then authenticate any required accounts.

### Claude responsibilities — temporary primary implementation track

Until Codex access is restored, Claude owns all work that can be completed without a live Codex worker:

1. Preserve the known-good runtime while developing only in the clean Git clone.
2. Review and improve Windows command spawning, quoting, timeout handling, workspace isolation, and permission boundaries.
3. Implement task-store and log retention, the status command, sensitive-data protections, expanded tests, coverage, CI improvements, and documentation updates.
4. Prepare repeatable acceptance automation and the disposable workspace so the remaining live provider tests require minimal manual work.
5. Run `npm run doctor`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run smoke:http` after material changes.
6. Commit changes in small, reviewable units and clearly distinguish directly verified results from tests blocked by Codex quota.
7. Do not replace the known-good runtime or claim final Codex-path acceptance without live evidence.

### ChatGPT responsibilities — coordination and verification track

ChatGPT owns project coordination and independent operational verification:

1. Maintain `PROJECT_STATUS.md`, the responsibility matrix, and the handoff sequence.
2. Direct Claude's work and review repository diffs, documentation, and claimed outcomes.
3. Run available Windows, Git, health, build, and test checks through connected tools.
4. Keep the active runtime operational and synchronize approved changes between the development clone, GitHub, and runtime documentation.
5. Record blockers and evidence honestly and prevent unverified tests from being marked complete.
6. Coordinate JC decisions, external authentication, and the later Codex validation run.

### Codex responsibilities — after quota restoration

Codex is temporarily removed from general implementation. After access resets, Codex must:

1. Complete real authenticated Claude-to-Codex and Codex-to-Claude read-only handoffs using the latest development build.
2. Complete real authenticated `workspace_write` handoffs in both directions in the disposable repository.
3. Verify exact file contents, Git diffs, guardrail failures, warning output, test execution, and worker-process cleanup.
4. Independently review material Claude implementation changes and identify regressions or missing tests.
5. Update the acceptance records only with directly observed task IDs and results.

### Decision gates

#### Gate A — Work that can proceed without JC input

Claude may proceed with all non-Codex-dependent implementation and review work, including static Windows spawn review, acceptance automation, the status command, retention, sensitive-data improvements, expanded tests, coverage, CI maintenance, cross-platform preparation, and documentation. ChatGPT coordinates and verifies these changes. Live Codex-path validation remains deferred until quota restoration.

#### Gate B — JC approval or selection required

JC input on these items is now provided (July 17): deletion of the stale copy is approved pending inspection, the Agent Bridge clean dev clone is the first write-enabled workspace, and distribution is ZIP-then-installer. No further JC approval is required to proceed with the associated Claude/ChatGPT work; the remaining execution is implementation, not decision.

#### Gate C — Hosted deployment decision required

JC has chosen to remain local-only for now (July 17). No hosted deployment work should begin beyond architecture, documentation, and recommendations. This gate reopens only if JC later decides to pursue hosting, at which point the hosted scope, users, provider, hostname, OAuth approach, and expected cost must be approved.

### Execution order

1. **Claude:** inspect the current implementation and complete all static architecture, security, privacy, command-spawn, workspace-write, and acceptance-procedure review work.
2. **Claude:** implement the highest-priority non-Codex-dependent work: retention and rotation, status reporting, sensitive-data protections, expanded failure-mode tests, coverage, CI improvements, and acceptance automation.
3. **Claude:** run the complete verification suite, update documentation and acceptance preparation, and commit changes in small reviewable units without replacing the known-good runtime.
4. **ChatGPT:** review Claude's diffs and claims, run available Windows and repository verification, synchronize approved documentation, and record any remaining defects or blockers.
5. **Codex after quota restoration:** run the real bidirectional read-only and `workspace_write` provider acceptance tests and independently review Claude's material changes.
6. **Claude and ChatGPT:** apply valid Codex findings and close the live acceptance items using task IDs, exact diffs, guardrail results, warning output, and cleanup evidence.
7. **JC:** select the first real workspace and desired distribution direction before real-project write access or packaging begins.

## Claude Handoff — Current Turn

Claude is temporarily the primary implementation agent. Work from the latest `main` branch in the clean development clone and proceed without waiting for Codex on anything that does not require a live Codex worker.

Required work:

1. Review `PROJECT_STATUS.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/DEVELOPMENT.md`, `docs/ACCEPTANCE-WORKSPACE-WRITE.md`, `docs/WINDOWS-INSTALL-LOG.md`, `docs/SECURITY.md`, and the relevant source and tests.
2. Audit `src/adapters/command.ts` and its tests for Windows quoting, argument escaping, shell behavior, timeout handling, process cleanup, and DEP0190 regression risk. Fix defects and add tests where possible without invoking Codex.
3. Audit and harden `workspace_write`, workspace allowlisting, injected worker instructions, cancellation, recursive-delegation prevention, task storage, logging, backups, and sensitive-data handling.
4. Implement task and log retention or rotation and a useful status command covering health, PID, queue state, worker availability, and recent failures.
5. Expand automated tests for malformed output, large results, timeout recovery, store corruption, concurrent task bursts, cleanup, and guardrail behavior.
6. Add automated coverage reporting with a defensible initial threshold and integrate it into CI without weakening existing checks.
7. Improve `docs/ACCEPTANCE-WORKSPACE-WRITE.md` and, where practical, add repeatable scripts that prepare the disposable repository and verify results and guardrails. Do not claim the Codex side passed.
8. Run `npm run doctor`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run smoke:http` after changes.
9. Update `PROJECT_STATUS.md`, `CHANGELOG.md`, relevant release notes, Windows or acceptance logs, and any user or developer documentation affected by the changes.
10. Commit changes to the current branch in small, clear commits. Do not push unless explicitly instructed. Do not modify the active known-good runtime.

Required reporting:

- Separate completed implementation from recommendations.
- List changed files, tests, exact command results, commit SHAs, and unresolved blockers.
- Clearly label every item that still requires a real Codex worker.
- Do not mark the DEP0190 live handoff or bidirectional `workspace_write` acceptance complete without task IDs and direct evidence.

## Current Next Action

Claude should begin the temporary primary implementation track immediately. ChatGPT will verify and synchronize Claude's work after the handoff. When Codex access returns, Codex will perform only the live provider-specific acceptance tests and an independent review of Claude's material changes.

The current working runtime must remain available. Codex-dependent read-only and `workspace_write` acceptance items remain pending until directly verified.

## Claude Implementation Turn — Completed (July 14, 2026)

Directly verified from the clean development clone
(`C:\Users\JC Harvey\Documents\AgentBridge-dev`). The known-good runtime at
`C:\Users\JC Harvey\Documents\AgentBridge` was not modified. Commits are local
and unpushed for ChatGPT review.

Implemented and directly verified (Claude worker + mocked Codex only):

- **`command.ts` hardening.** Worker timeout and cancellation now terminate the
  entire process tree (Windows `taskkill /T`, POSIX process group) with a
  force-kill escalation, so no worker or grandchild is left running. `stdin` is
  destroyed on settle (fixing a dangling-handle hang) and EPIPE is ignored. The
  DEP0190-safe Windows spawn is retained. New tests: prompt cancellation, stdin
  robustness, large output, quoting edge cases.
- **Retention.** Configurable task-store pruning (`retention.maxCompletedTasks`,
  `retention.maxTaskAgeDays`) on startup and after each task; queued/running
  tasks are never pruned. Session log rotation on start bounded by
  `retention.maxLogFiles`.
- **Status command.** `agent-bridge status` / `npm run status` reports health,
  PID, endpoint, worker availability, queue counts, running tasks, recent
  failures, data directory, and retention; `--json` supported. Verified live.
- **Tests.** 27 total, all passing, including store corruption, retention,
  unknown workspace, permission-mode propagation, worker failure, large result,
  and concurrent bursts.
- **Coverage.** `npm run coverage` enforces line >= 70, branch >= 65,
  funcs >= 70 (measured 76 / 71 / 79); a Node 22 CI job runs it without weakening
  the existing typecheck/test/build/smoke gates.
- **Acceptance harness.** `scripts/acceptance-harness.ps1`
  (`prepare` / `verify` / `cleanup`); the full lifecycle was exercised directly.
- **`doctor`** no longer triggers DEP0190 on Windows.

Verification results (dev clone): `npm run doctor` PASS (with a local, gitignored
`bridge.config.json`), `npm run typecheck` exit 0, `npm test` 27/27 pass,
`npm run build` exit 0, `npm run smoke:http` PASS, `npm run coverage` exit 0,
`agent-bridge status` verified against the running broker.

Security and hardening findings:

- Cancellation previously left worker grandchildren running on Windows because
  only the launcher wrapper was signalled. Fixed with tree termination; a live
  multi-hop check on a non-sandboxed Windows session is still recommended (the
  `taskkill` reaper did not fire in the Claude Desktop sandbox, so the direct
  `child.kill()` guarantees settlement while the tree reaper is best-effort).
- `status` output and stored errors are truncated (errors to 200 chars) and
  never print full task text or results; task-store files are written mode 0600.
  Retention shortens the window that sensitive prompt/result text persists.
- Workspace allowlisting, source/target separation, delegation-depth and
  recursive-delegation guards, and per-worker credential isolation were reviewed
  and remain intact; no regressions introduced.
- Backup/sharing risk: `.agent-bridge/tasks.json` and rotated logs may contain
  prompt and result text. Retention plus the `docs/SECURITY.md` review guidance
  mitigate this, but operators should still review before sharing.

Still requires a live Codex worker (NOT verified this turn):

- Real bidirectional read-only handoffs on this build (task IDs required).
- Real bidirectional `workspace_write` handoffs with exact diffs and guardrail
  results.
- Live confirmation that no worker process lingers after a real handoff
  (tree-kill verified in unit and cancellation-timing form; provider-path
  evidence pending).
- A DEP0190-free live worker launch on Windows.

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
