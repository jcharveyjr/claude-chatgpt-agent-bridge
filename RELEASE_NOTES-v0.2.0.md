# Release Notes — v0.2.0

**Release date:** July 23, 2026
**Type:** Minor feature release

Agent Bridge v0.2.0 adds a presentation-ready local demo console for making the
Claude and ChatGPT/Codex handoff visible without bypassing the bridge's normal
task queue or safety controls.

## Added

- A polished demo console at `http://127.0.0.1:8787/console/`.
- Live bridge, Claude, and ChatGPT/Codex worker status.
- Delegation controls for source, target, named workspace, read-only or
  workspace-write mode, task context, and success criteria.
- Live task polling, recent history, task detail, provider results and errors,
  copy-to-clipboard, and cancellation.
- A same-origin console API backed directly by the existing broker.
- Console lifecycle, payload, origin, bearer-token, and non-loopback tests.
- `docs/DEMO-CONSOLE.md` with the walkthrough, API routes, security behavior,
  and troubleshooting.

## Security

- The console is served only when the broker is bound to loopback
  (`127.0.0.1`, `::1`, or `localhost`).
- Console API calls reuse the bridge's existing bearer or OAuth authorization.
- An optional bearer token is held in page memory only and is never persisted
  to browser storage.
- Origin checks, workspace allowlisting, permission modes, source/target
  separation, task-size limits, and delegation-depth guards remain enforced.
- The HTML shell contains no task records; task data is returned only after API
  authorization.

The console's REST routes are an internal UI surface. MCP remains the supported
external connector contract, so this release does not add Swagger/OpenAPI
documentation.

## Validation

- `npm run doctor`
- `npm run typecheck`
- `npm test` — 56/56 passing
- `npm run build`
- `npm run smoke:http`
- `npm run coverage` — 83.08% lines, 74.27% branches, 82.68% functions
- `npm audit --audit-level=high` — zero high or critical findings
- GitHub CI on Node 20 and Node 22, plus the Node 22 coverage gate
- Desktop headless-browser rendering
- Real console API handoff to Codex task
  `006a6521-6396-4bc7-b6d6-7a4028059d1b` returned
  `CODEX_V020_CANDIDATE_OK version=0.2.0`.
- Real console API handoff to Claude task
  `7d004d7e-9f58-4025-b80a-52fe5c9050d1` returned
  `CLAUDE_V020_CANDIDATE_OK version=0.2.0`.
- Neither live provider task changed source files, and no worker remained.

Two moderate transitive `@hono/node-server` `serveStatic` advisories remain.
Agent Bridge does not import or call the affected handler and is loopback-only
by default; npm's proposed remediation is a breaking MCP SDK downgrade.
