# Demo Console

The Agent Bridge demo console is a local web interface for showing and testing
Claude-to-ChatGPT/Codex handoffs without manually calling MCP tools.

## Open the console

Start the shared HTTP broker:

```powershell
npm run start:windows
```

Then open:

```text
http://127.0.0.1:8787/console/
```

The console is intentionally available only when the bridge is bound to a
loopback host (`127.0.0.1`, `::1`, or `localhost`). It is not served from a
public or LAN-bound broker.

## Demo flow

1. Confirm the header says **Bridge online** and both worker cards are connected.
2. Choose the receiving agent: Claude or ChatGPT/Codex.
3. Choose the source, allowed workspace, and permission mode.
4. Enter one bounded task. Optional context and success criteria are available
   in the expandable section.
5. Select **Delegate task**.
6. Watch the task move from `queued` to `running` to a terminal state.
7. Inspect or copy the provider result. A queued or running task can be
   cancelled from the detail panel.

The ChatGPT target uses the local Codex CLI worker. The Claude target uses
Claude Code. The console does not impersonate either consumer application; it
drives the same broker and worker adapters those applications use.

## Authentication

The console API uses the bridge's existing authorization:

- With no configured bridge token on loopback, the console works immediately.
- If `AGENT_BRIDGE_TOKEN` is configured, enter it in the bearer-token field.
- The token stays in page memory and is not written to browser storage.
- Origin checks, workspace allowlisting, source/target separation, task-size
  limits, permission modes, and delegation-depth rules still apply.

The HTML shell contains no task data. Task history and results are returned only
after the API request is authorized.

## Console API

These same-origin routes support the UI:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/console/api/capabilities` | Bridge version, instance, workers, and workspaces |
| `GET` | `/console/api/tasks` | Recent tasks, with optional status/target filters |
| `POST` | `/console/api/tasks` | Queue a delegated task |
| `GET` | `/console/api/tasks/{id}` | Read one task and its result |
| `POST` | `/console/api/tasks/{id}/cancel` | Cancel a queued or running task |

This is a small internal API for the bundled console, not the public integration
contract. MCP remains the supported connector interface, so a Swagger page is
not included. If the REST surface becomes a supported external API later, add
an OpenAPI contract and generated documentation at that point.

## Troubleshooting

- **Connection needed:** verify `http://127.0.0.1:8787/health` and enter the
  bearer token if one is configured.
- **Worker unavailable:** run `npm run doctor` and sign in to the affected CLI.
- **Claude spend-limit error:** raise the Anthropic monthly limit or wait for
  its reset. The bridge will preserve and display the provider's exact message.
- **Unknown workspace:** add the project path to `workspaces` in
  `bridge.config.json`, restart the broker, and select the named workspace.
- **Console returns 404:** ensure `http.host` is a loopback host. The console is
  deliberately disabled on non-loopback bindings.
