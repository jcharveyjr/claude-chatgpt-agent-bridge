# Acceptance Test — `workspace_write` Delegation

This procedure verifies a real, authenticated cross-vendor handoff in
`workspace_write` mode, where the worker agent actually edits files. Read-only
handoffs are already validated; this closes the gap for write mode.

> Run this on a host that has authenticated `claude` and `codex` CLIs. It cannot
> be run in a CI sandbox because it invokes the real provider CLIs.

## Preconditions

- `claude --version` and `codex --version` both succeed and are signed in.
- `npm run doctor` reports all checks `PASS`.
- The bridge builds and tests pass: `npm run typecheck && npm test && npm run build`.

## 1. Create a disposable workspace

Never point `workspace_write` at a real project for the first run.

```bash
mkdir -p /tmp/bridge-accept && cd /tmp/bridge-accept
git init -q
printf "# scratch\n" > README.md
git add -A && git commit -qm "seed"
```

## 2. Allowlist it in bridge.config.json

Add a named workspace (keep the change local; do not commit real paths):

```json
{
  "workspaces": {
    "bridge": ".",
    "accept": "/tmp/bridge-accept"
  }
}
```

Restart the broker so it reloads config: `npm run start:http`.

## 3. Delegate a bounded write task

From Claude (targeting Codex) or Codex (targeting Claude), call the MCP tools:

1. `agent_bridge_capabilities` — confirm the peer is `available: true` and that
   `accept` appears under `workspaces`.
2. `delegate_task` with:
   - `target_agent`: the peer (e.g. `codex`)
   - `source_agent`: yourself (e.g. `claude`)
   - `workspace`: `accept`
   - `mode`: `workspace_write`
   - `task`: "Create hello.txt containing the text HELLO_BRIDGE and nothing else."
   - `success_criteria`: ["hello.txt exists", "file content is exactly HELLO_BRIDGE"]
3. Continue other work; the call returns a task id immediately.
4. `get_task` with the returned id until `status` is `completed`.

## 4. Verify the result

```bash
cd /tmp/bridge-accept
cat hello.txt          # expect: HELLO_BRIDGE
git status --porcelain # expect: ?? hello.txt (or M if pre-existing)
```

Confirm in the returned task record:

- `status` is `completed`.
- `result` describes the file created and validation performed.
- `mode` is `workspace_write`.

## 5. Negative checks (guardrails)

- Repeat with `mode: read_only` and a write task; the worker must refuse to edit
  and report inspect-only, per the injected prompt policy.
- Attempt a workspace name not in the allowlist; `delegate_task` must error with
  "Unknown workspace".
- Delegate a task whose `source_agent` equals `target_agent`; it must error with
  "must differ".

## 6. Record the outcome

Append a dated row to `docs/WINDOWS-INSTALL-LOG.md` (or a new
`docs/ACCEPTANCE-LOG.md`) capturing: date, direction, mode, task id, result
summary, and any defects found. Update the acceptance table in
`PROJECT_STATUS.md` and `RELEASE_NOTES-*.md`.

## Pass criteria

The handoff is accepted when the write task completes, the file matches the
success criteria exactly, all three negative checks behave as specified, and no
worker process is left running afterward.
