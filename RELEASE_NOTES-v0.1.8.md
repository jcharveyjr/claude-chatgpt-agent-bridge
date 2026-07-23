# Release Notes — v0.1.8

**Release date:** July 23, 2026
**Scope:** Local Windows reliability, status, retention, and live write-mode acceptance

Agent Bridge v0.1.8 hardens the local MCP task broker used by Claude Code and
Codex/ChatGPT. This release keeps the existing asynchronous delegation model
while improving Windows worker cleanup, operational visibility, bounded runtime
data, and acceptance coverage.

## Highlights

- Deterministic Windows worker process-tree cleanup on cancellation and timeout,
  including force-kill escalation and grandchild-process tests.
- DEP0190-safe Windows command construction and doctor checks.
- `agent-bridge status` with human-readable and JSON output for broker health,
  instance matching, queue state, task-store health, detected worker commands,
  running tasks, recent failures, and retention settings.
- Configurable completed-task retention and bounded prior-session log rotation.
- Clear distinction between a detected CLI command and verified provider
  readiness; authentication or quota is proven only by a real task.
- Repeatable Windows `workspace_write` acceptance harness whose default location
  avoids short-name Windows temp paths.

## Live Windows acceptance

Validated on `DESKTOP-50IKOHS` using authenticated Claude Code `2.1.207` and
Codex CLI `0.144.3` against an isolated loopback broker and disposable Git repo.

| Check | Evidence | Result |
| --- | --- | --- |
| Claude `workspace_write` | Task `6b5789cd-2f80-4231-88a6-958dbefbebdc` | Exact 12-byte `HELLO_BRIDGE`; no other changes |
| Codex `workspace_write` | Task `7141e2b3-79cf-46da-a314-a71a51cff293` | Exact 12-byte `HELLO_BRIDGE`; no other changes |
| Read-only write refusal | Task `bc169c2f-27ba-45f1-87f6-ccf27d48ed20` | Access denied; repository remained clean |
| Unknown workspace | Live MCP call | Rejected with allowlist error |
| Same source and target | Live MCP call | Rejected as invalid cross-vendor delegation |
| Worker cleanup | Post-task process inspection | No Claude Code or Codex CLI worker remained |
| Windows deprecation check | Test broker stderr | No DEP0190 or deprecation warning |

The first harness attempt used the Windows temp directory, which resolved through
the `JCHARV~1` short path and was correctly blocked by Claude's sandbox. The
harness default now uses the user's Documents directory; both real write-mode
runs then passed without interactive approval.

## Automated verification

| Check | Result |
| --- | --- |
| `npm run doctor` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | 49 of 49 pass |
| `npm run build` | Pass |
| `npm run smoke:http` | Pass |
| `npm run coverage` | 77.91% lines, 73.89% branches, 81.71% functions |

The enforced minimums remain 70% lines, 65% branches, and 70% functions.

## Upgrade

```powershell
git pull
npm install --include=dev
npm run build
npm run doctor
npm run stop:windows
npm run start:windows
npm run status
```

Preserve the local `bridge.config.json`, `.env`, and `.agent-bridge` directory;
they are intentionally excluded from Git.

## Known limits

- The JSON task store is for one host and one shared broker process.
- Command detection does not prove provider authentication or quota; submit a
  bounded read-only task when live provider readiness must be verified.
- ChatGPT Work/web and Claude web/Cowork require a hosted HTTPS connector and
  authorization. v0.1.8 remains intentionally local-only.
- macOS and Linux installation acceptance remains pending.
