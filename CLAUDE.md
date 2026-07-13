# Agent Bridge Project Guidance

Use `skills/delegate-to-peer/SKILL.md` for cross-vendor delegation. Do not delegate a task that was itself received through Agent Bridge.

Project checks:

```bash
npm run typecheck
npm test
npm run build
```

Keep the MCP tools asynchronous, preserve named workspace allowlists and delegation-depth limits, and never commit credentials. Run `npm run sync:skills` after editing the canonical skill.

For simultaneous Claude and Codex use, connect both to one loopback HTTP broker at `http://127.0.0.1:8787/mcp`. Stdio is for one client or an isolated store.
