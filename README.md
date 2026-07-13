# Claude + ChatGPT Agent Bridge

Agent Bridge is a working MCP task broker that lets Claude and Codex/ChatGPT agents assign bounded work to one another, continue independently, and retrieve the peer result later.

The linked Cognito Forms video demonstrates a useful shared-tool pattern: both AI products connect to one external MCP-backed system. Agent Bridge extends that pattern with a task queue and worker adapters, because sharing a connector alone does not create agent-to-agent delegation.

## Current Status

- Working MCP server over local stdio and remote-capable Streamable HTTP
- Persistent asynchronous task queue
- Claude Code and Codex CLI worker adapters
- Read-only and workspace-write modes
- Workspace allowlist instead of arbitrary paths
- Cancellation, restart recovery, nesting limits, and circular-delegation protection
- Static bearer authentication for local/private setups
- OAuth/JWT protected-resource support for hosted connectors
- Shared Claude/Codex delegation skill and plugin scaffolds
- Automated protocol and queue tests

See [Validation and Compatibility](docs/VALIDATION.md) for what is proven, what depends on account access, and the product-by-product support matrix. Follow [Setup Tutorial](docs/TUTORIAL.md) to install it.

## Quick Local Start

On Windows, macOS, or Linux, the repeatable setup command checks the prerequisites, builds and tests the bridge, creates the local config if needed, and registers the MCP endpoint with both CLIs:

```bash
node scripts/setup-local.mjs
```

To make a particular project the default allowed workspace during setup:

```powershell
node .\scripts\setup-local.mjs --workspace-name my-project --workspace "C:\path\to\project"
```

Existing config and MCP registrations are preserved. To perform the same steps manually:

```bash
npm install
npm run build
cp bridge.config.example.json bridge.config.json
npm run doctor
```

Edit `bridge.config.json` so its named workspaces point to the project folders the agents may access. Start the single local broker before opening either agent:

```bash
npm run start:http
```

Connect both Claude Code and Codex to `http://127.0.0.1:8787/mcp` using the examples in `configs/`. One shared HTTP process is the recommended two-agent setup. Stdio is included for single-client or diagnostic use.

The MCP tools are:

- `agent_bridge_capabilities`
- `delegate_task`
- `get_task`
- `list_tasks`
- `cancel_task`

## Security Model

The bridge never asks for or copies ChatGPT or Claude session tokens. Local workers reuse the authenticated `claude` and `codex` CLIs on the same machine. HTTP deployment requires a bearer token or OAuth/JWT configuration when it binds outside loopback. Provider API/CLI credentials remain on the worker host and are not returned through MCP.

See [Security](docs/SECURITY.md) before exposing the HTTP endpoint.
