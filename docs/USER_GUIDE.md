# Agent Bridge — User Guide

_Current version: 0.1.11_

Agent Bridge is a vendor-neutral MCP task broker that lets Claude Code and
Codex/ChatGPT agents delegate bounded work to one another through a shared,
persistent, asynchronous task queue. One agent submits a task, keeps working,
and retrieves the peer's result later.

This guide covers installing, configuring, running, and using the bridge in its
current local form. For hosted/web deployment see `docs/HOSTED-DEPLOYMENT.md`;
for the development workflow see `docs/DEVELOPMENT.md`.

## 1. How it works

- The bridge runs a small MCP server exposing five tools (below).
- `delegate_task` records a task in a persistent JSON queue and returns an id
  immediately. The task runs asynchronously on the *target* agent's local CLI
  (`claude -p` or `codex exec`).
- You poll `get_task` for status and, when finished, the result.
- Work stays bounded and safe: named-workspace allowlisting, read-only vs
  workspace-write modes, delegation-depth limits, and circular-delegation guards.

```
Claude Code ─┐                        ┌─▶ runs `codex exec` (worker)
             ├─▶ Agent Bridge (MCP) ──┤
Codex CLI  ──┘     task queue         └─▶ runs `claude -p` (worker)
```

## 2. Requirements

- Node.js >= 20 (tested on 20 and 22; also runs on 24).
- Authenticated `claude` (Claude Code) and `codex` (Codex CLI) on the same
  machine — the bridge reuses their existing sign-ins and never handles tokens.
- Git (for cloning and updates).

## 3. Install

### Automated (recommended)

From the repository root:

```bash
node scripts/setup-local.mjs
```

This checks prerequisites, installs dependencies (including devDependencies even
when npm is configured with `omit=dev`), creates `bridge.config.json` if missing,
builds, tests, synchronizes the delegation skill, and registers the MCP endpoint
with both CLIs.

To make a specific project the default allowed workspace:

```bash
node scripts/setup-local.mjs --workspace-name my-project --workspace "C:\path\to\project"
```

Useful flags: `--dry-run`, `--skip-install`, `--skip-register`, `--help`.

### Manual

```bash
npm install --include=dev
npm run build
cp bridge.config.example.json bridge.config.json   # copy on Windows: Copy-Item
npm run doctor
```

> Tip: if `tsc` is "not recognized", your npm has `omit=dev` (or
> `NODE_ENV=production`) set, which skips devDependencies. Reinstall with
> `npm install --include=dev`.

## 4. Configure

Edit `bridge.config.json`. Key fields:

- `workspaces` — a name-to-path allowlist. Agents may only touch these named
  workspaces, never arbitrary paths. Example:
  `{ "bridge": ".", "my-project": "C:\\path\\to\\project" }`.
- `defaultWorkspace` — used when a task omits `workspace`.
- `maxDelegationDepth` — nesting limit for delegated sub-tasks (default 2).
- `maxTaskCharacters` — combined task+context+criteria size cap (default 50000).
- `agents.claude` / `agents.codex` — adapter, command, enabled, timeoutMs, and
  optional model/maxTurns.
- `http.host` / `http.port` / `http.allowedOrigins`.

Runtime files (`bridge.config.json`, `.env`, `.agent-bridge/`, logs) are
gitignored — keep them local.

### Environment (`.env`)

`.env` is auto-loaded at startup when present (override the path with
`AGENT_BRIDGE_ENV_FILE`). Common variables:

- `AGENT_BRIDGE_TOKEN` — required when HTTP binds to anything other than
  loopback.
- `AGENT_BRIDGE_HOST`, `AGENT_BRIDGE_PORT`, `AGENT_BRIDGE_ALLOWED_ORIGINS`.
- OAuth mode: `AGENT_BRIDGE_PUBLIC_URL`, `AGENT_BRIDGE_OAUTH_ISSUER`,
  `AGENT_BRIDGE_OAUTH_AUDIENCE`, `AGENT_BRIDGE_OAUTH_JWKS_URL`,
  `AGENT_BRIDGE_OAUTH_SCOPES` (see the hosted guide).

## 5. Run the broker

Start one shared HTTP broker before opening either agent:

```bash
npm run start:http
```

On Windows you can run it detached and stop it later:

```powershell
npm run start:windows
npm run stop:windows
```

Health check:

```bash
curl http://127.0.0.1:8787/health      # {"ok":true,"service":"agent-bridge"}
```

One shared HTTP process is the recommended setup for two agents. Stdio
(`npm run start:stdio`) is for a single client or isolated diagnostics — do not
run multiple stdio brokers against the same task store.

## 6. Connect Claude Code and Codex

Point both at `http://127.0.0.1:8787/mcp` (the setup script does this for you):

```bash
claude mcp add --transport http agent-bridge http://127.0.0.1:8787/mcp
codex mcp add agent-bridge --url http://127.0.0.1:8787/mcp
```

## 7. The MCP tools

Call these by their base names even if your client prefixes them.

### agent_bridge_capabilities
Read-only. Returns configured agents, their availability, workspaces, default
workspace, delegation limit, and supported modes. Call it once before your first
delegation in a session.

### delegate_task
Queues a bounded task and returns an id immediately. Parameters:

| Parameter | Required | Notes |
| --- | --- | --- |
| `target_agent` | yes | `claude` or `codex` (the peer). |
| `source_agent` | yes | `claude`, `codex`, `chatgpt`, `human`, or `unknown`. Must differ from target. |
| `task` | yes | The bounded instruction. |
| `workspace` | no | Named workspace; defaults to `defaultWorkspace`. |
| `mode` | no | `read_only` (default) or `workspace_write`. |
| `context` | no | Only the context needed for the deliverable. |
| `success_criteria` | no | Up to 20 observable criteria. |
| `parent_task_id` | no | For a true nested sub-task (respects depth limit). |
| `metadata` | no | String key/value pairs. |

### get_task
Read-only. Returns current status and, when finished, the `result` or `error`
for one task id.

### list_tasks
Read-only. Lists recent tasks, optionally filtered by `status` or
`target_agent`, with a `limit` (1-200, default 50).

### cancel_task
Cancels a queued or running task. Completed tasks are returned unchanged.

## 8. The delegate-to-peer skill

The bundled `delegate-to-peer` skill tells the agent when and how to use these
tools. In short: call capabilities first; delegate one bounded deliverable with
the least-permissive mode; keep working; retrieve and verify before integrating.
Never delegate a task that was itself received through the bridge. After editing
`skills/delegate-to-peer/SKILL.md`, run `npm run sync:skills`.

## 9. Permission modes

- `read_only` — the worker inspects and reports only; no file or external
  changes. Use for analysis, review, planning, and research.
- `workspace_write` — the worker may edit files inside the named workspace only.
  It must not publish, push, send, purchase, or deploy unless the task says so
  and the runtime independently authorizes it. Validate before first real use
  with `docs/ACCEPTANCE-WORKSPACE-WRITE.md`.

## 10. Security

- HTTP binds to loopback by default and needs no token there.
- Off-loopback binding requires `AGENT_BRIDGE_TOKEN` or OAuth/JWT configuration.
- Provider CLI credentials stay on the worker host and are never returned through
  MCP; cross-vendor API keys are stripped from the worker environment.
- Do not put secrets, tokens, or unrelated private data in task text or context.
- Review generated task records before sharing; they may contain project info.

See `docs/SECURITY.md` before exposing the HTTP endpoint.

## 11. Troubleshooting

- **`tsc` not recognized / build fails:** devDependencies were skipped by an
  `omit=dev` npm config. Run `npm install --include=dev`.
- **`git commit` "unable to auto-detect email":** set an identity
  (`git config user.email ...` and `user.name ...`).
- **Peer "unavailable":** the target CLI is not installed, not signed in, or
  disabled in `bridge.config.json`. Run `npm run doctor`.
- **"Unknown workspace":** the workspace name is not in the allowlist.
- **Task stuck in `queued`/`running`:** check the broker is up
  (`/health`), then `list_tasks`; use `cancel_task` if needed. Interrupted
  running tasks are auto-requeued on restart.
- **Full diagnostics:** `npm run doctor`.

## 11a. Monitoring and retention

Check the broker and queue at any time:

```bash
npm run status          # human-readable
node dist/src/cli.js status --json   # machine-readable
```

It reports health, PID, endpoint, worker availability, queue counts by status,
running tasks, recent failures, the data directory, and the retention settings.

The task store is pruned automatically so `.agent-bridge` cannot grow without
bound. Tune it under `retention` in `bridge.config.json`:

- `maxCompletedTasks` (default 500) — keep at most this many terminal tasks.
- `maxTaskAgeDays` (default 30) — drop terminal tasks older than this.
- `maxLogFiles` (default 5) — prior-session broker logs to keep on Windows.

Queued and running tasks are never pruned. Set a value to `0` to disable that
particular limit.

## 12. Further reading

- `README.md` — overview and quick start.
- `docs/TUTORIAL.md` — step-by-step setup.
- `docs/DEVELOPMENT.md` — local-clone development workflow.
- `docs/ACCEPTANCE-WORKSPACE-WRITE.md` — write-mode acceptance procedure.
- `docs/HOSTED-DEPLOYMENT.md` — public HTTPS + OAuth deployment.
- `docs/VALIDATION.md` — compatibility matrix and what is proven.
- `docs/SECURITY.md` — security model.
- `CHANGELOG.md`, `RELEASE_NOTES-v0.1.11.md`, `PROJECT_STATUS.md`.
