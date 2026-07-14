# Release Notes — v0.1.7

**Status:** Local Windows MVP, validated with real authenticated handoffs in both
directions (Claude → Codex and Codex → Claude).

Agent Bridge is a vendor-neutral MCP task broker that lets Claude Code and
Codex/ChatGPT agents delegate bounded work to one another through a shared,
persistent, asynchronous task queue.

## Highlights

- MCP server over local stdio and remote-capable Streamable HTTP.
- Persistent asynchronous task queue: create, status, filter, results.
- Claude Code and Codex CLI worker adapters.
- Read-only and workspace-write sandbox modes with named-workspace allowlisting.
- Cancellation, restart recovery, nesting limits, and circular-delegation guards.
- Static bearer auth for local/private use; OAuth/JWT for hosted connectors.
- Shared Claude/Codex delegation skill and plugin scaffolds.
- Repeatable local setup plus Windows start/stop scripts and sign-in autostart.

## MCP tools

`agent_bridge_capabilities`, `delegate_task`, `get_task`, `list_tasks`,
`cancel_task`.

## Verification (from a clean clone)

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | 13 of 13 pass |
| `npm run build` | Pass |
| `npm run smoke:http` | Pass |
| Real Codex → Claude read-only handoff | Pass |
| Real Claude → Codex read-only handoff | Pass |

## Install

See `docs/TUTORIAL.md`. Quick start:

```bash
node scripts/setup-local.mjs
npm run start:http
```

## How to cut this release on GitHub

This repository has no release-creation automation yet, so tag and publish
manually (the connector used for commits cannot create tags or releases):

```bash
git checkout main && git pull
git tag -a v0.1.7 -m "Agent Bridge v0.1.7"
git push origin v0.1.7
```

Then on GitHub: **Releases → Draft a new release → choose tag `v0.1.7`**, paste
the contents of this file as the description, and publish. Alternatively use the
GitHub CLI:

```bash
gh release create v0.1.7 --title "v0.1.7" --notes-file RELEASE_NOTES-v0.1.7.md
```

## Known limitations

- JSON task store is single-host; do not run multiple brokers against one store.
- Hosted/web surfaces (ChatGPT Work, Claude web/Cowork) require the hosted broker
  with OAuth; see `docs/HOSTED-DEPLOYMENT.md`.
- `workspace_write` delegation is implemented; see
  `docs/ACCEPTANCE-WORKSPACE-WRITE.md` for the acceptance procedure.
