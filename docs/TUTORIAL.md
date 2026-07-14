# Setup Tutorial

This tutorial starts with the fully local configuration and then extends it to ChatGPT Work and Claude Cowork.

For the recorded Windows installation, real two-direction handoffs, and compatibility corrections through version 0.1.7, see [Windows Installation Log](WINDOWS-INSTALL-LOG.md).

## Phase 1: Install the Local Bridge

### 1. Install prerequisites

Install Node.js 20 or newer, [Claude Code](https://code.claude.com/docs/en/overview), and [Codex CLI](https://learn.chatgpt.com/docs/codex/cli). Sign in to each CLI normally on the same machine. Do not copy tokens between products.

Confirm both commands work:

```bash
claude --version
codex --version
```

### 2. Install and build Agent Bridge

From this repository, run the repeatable setup command:

```powershell
node .\scripts\setup-local.mjs
```

It checks Node.js, Claude Code, and Codex; installs dependencies; creates the safe loopback config if one does not exist; selects the native `codex.exe` worker on Windows; synchronizes skills; type-checks, tests, and builds the project; starts the compiled server on a temporary loopback port for a health check; registers `agent-bridge` with both CLIs; and runs the installation doctor. Existing workspaces and MCP registrations are preserved.

To allow a project folder and make it the default workspace in the same run:

```powershell
node .\scripts\setup-local.mjs --workspace-name workbooks --workspace "C:\Users\JC Harvey\Documents\Workbooks\new"
```

Use only letters, numbers, underscores, and hyphens in the workspace name. The full path may contain spaces. Run `node .\scripts\setup-local.mjs --help` for no-register and dry-run options.

The equivalent manual build steps are:

```bash
npm install
npm run build
```

Copy `bridge.config.example.json` to `bridge.config.json`. On Windows PowerShell:

```powershell
Copy-Item bridge.config.example.json bridge.config.json
```

Edit `bridge.config.json`:

- Give every allowed project folder a short workspace name.
- Set `defaultWorkspace` to the workspace agents should use when none is supplied.
- Leave the HTTP host on `127.0.0.1` for now.
- Keep OAuth unset for local loopback mode.

Example:

```json
{
  "dataDirectory": ".agent-bridge",
  "defaultWorkspace": "workbooks",
  "maxDelegationDepth": 2,
  "maxTaskCharacters": 50000,
  "workspaces": {
    "workbooks": "C:/Users/JC Harvey/Documents/Workbooks/new",
    "agent-bridge": "."
  },
  "agents": {
    "claude": {
      "adapter": "claude-cli",
      "command": "claude",
      "enabled": true,
      "timeoutMs": 1800000,
      "maxTurns": 30
    },
    "codex": {
      "adapter": "codex-cli",
      "command": "codex",
      "enabled": true,
      "timeoutMs": 1800000
    }
  },
  "http": {
    "host": "127.0.0.1",
    "port": 8787,
    "allowedOrigins": ["https://chatgpt.com", "https://claude.ai"]
  }
}
```

Run the checks:

```bash
npm run doctor
npm test
npm run smoke:http
```

If the setup command completed successfully, these checks and the MCP registration steps below are already done. They remain documented for verification and recovery.

Start one shared broker in a dedicated terminal:

```bash
npm run start:http
```

Leave this process running while Claude and Codex work. Verify `http://127.0.0.1:8787/health` returns an `ok` response.

On Windows, start or stop a hidden detached broker with:

```powershell
npm run start:windows
npm run stop:windows
```

To start it automatically at sign-in, place a small command file in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` that invokes `scripts\start-agent-bridge.ps1`. The completed installation uses `AgentBridge.cmd`; the start script is idempotent and exits successfully if the health endpoint is already up. Logs and `bridge.pid` are written under `.agent-bridge`.

### 3. Connect Claude Code

Copy `configs/claude-local.mcp.example.json` to the project root as `.mcp.json`.

Alternatively, add it with the Claude CLI:

```bash
claude mcp add --scope user --transport http agent-bridge http://127.0.0.1:8787/mcp
```

Run `claude mcp list` and confirm `agent-bridge` is connected.

### 4. Connect Codex and the ChatGPT desktop app

Use `configs/codex-local.config.example.toml` as the MCP section in the relevant Codex `config.toml`. The ChatGPT desktop app, Codex CLI, and the IDE extension share the same Codex-host MCP configuration.

You can also add it from the CLI:

```bash
codex mcp add agent-bridge --url http://127.0.0.1:8787/mcp
```

Allow only the safe task-submission tool to run noninteractively by adding this to the Codex configuration after registration:

```toml
[mcp_servers.agent-bridge.tools.delegate_task]
approval_mode = "approve"
```

Keep `cancel_task` and other state-changing tools on their normal approval policy.

Run `codex mcp list` and confirm `agent-bridge` is connected.

### 5. Install the delegation skills

The same skill is synchronized into `.claude/skills/`, `.codex/skills/`, and both plugin packages by:

```bash
npm run sync:skills
```

Claude Code discovers the project skill when launched from the repository. Codex can use the project skill or the plugin under `plugins/agent-bridge`.

### 6. Test each direction

In Claude Code:

> Use the delegate-to-peer skill. Ask Codex to review this repository's test coverage in read-only mode. Continue inspecting the architecture while it runs, then retrieve and summarize Codex's result.

In Codex:

> Use the delegate-to-peer skill. Ask Claude to review the README for missing setup steps in read-only mode. Retrieve the result and tell me which suggestions you agree with.

Expected sequence:

1. The agent calls `agent_bridge_capabilities`.
2. It calls `delegate_task` and receives a UUID.
3. The task moves from `queued` to `running` to `completed`.
4. The requester calls `get_task` and verifies the peer handoff.

Task history is stored in `.agent-bridge/tasks.json` with user-only file permissions where the operating system supports them.

For a two-agent setup, do not configure both products to spawn separate stdio copies that share the same task file. One loopback HTTP broker is the queue owner. Stdio mode is appropriate for a single client, isolated task stores, or protocol diagnostics.

## Phase 2: Enable Remote ChatGPT Work and Claude Cowork

Both web products reach remote MCP from their cloud environments. `localhost` and a private LAN address will not work.

### 7. Prepare a dedicated HTTPS host

Use a dedicated always-on host or VM that has:

- This built repository
- The authorized workspaces
- Authenticated Claude and Codex workers, or provider-specific worker credentials
- A reverse proxy or platform-managed HTTPS certificate
- Inbound access only to the HTTPS MCP endpoint

Set `AGENT_BRIDGE_HOST=0.0.0.0` only behind the authenticated HTTPS boundary. Never publish the raw development port directly.

### 8. Configure OAuth

Create an API/resource in your OAuth provider and a client for each AI product. Use Authorization Code with PKCE where the provider and client support it. Register the exact callback URLs shown during the ChatGPT and Claude connector setup flows; do not guess callback URLs.

Set the five OAuth environment variables documented in `.env.example`, then start:

```bash
npm run start:http
```

Verify:

```text
https://YOUR-HOST/health
https://YOUR-HOST/.well-known/oauth-protected-resource/mcp
```

The second URL should name your MCP resource, authorization server, and required scope.

### 9. Connect Claude Cowork

In Claude, open **Customize > Connectors**, add a custom connector, and enter:

```text
https://YOUR-HOST/mcp
```

Enter the OAuth client details when requested and complete authorization. Install the Claude plugin under `plugins/claude-agent-bridge` or upload its skill so Cowork knows when and how to delegate.

### 10. Connect ChatGPT Work

In ChatGPT Work, enable developer mode or use your workspace's approved plugin workflow, create an MCP-backed app pointing to:

```text
https://YOUR-HOST/mcp
```

Complete OAuth, test all five tools, then package the working app with the skill in `plugins/agent-bridge`. ChatGPT web does not read the local Codex MCP configuration, so this remote app/plugin step is required.

### 11. Acceptance test

Run one read-only task in each direction using a non-sensitive test repository:

1. ChatGPT Work delegates a review to Claude.
2. Claude Cowork delegates a code check to Codex.
3. Confirm both tasks appear in `list_tasks` with the correct source and target.
4. Confirm task results do not contain credentials or unrelated filesystem data.
5. Cancel a deliberately slow test task.
6. Restart the service during a queued test and verify it resumes.

Only after this test should write mode be enabled for production project folders.

## Repeat or Recover the Setup

1. Restore this repository.
2. Run `npm install`, `npm run build`, and `npm run sync:skills`.
3. Restore `bridge.config.json` and secrets from your password manager, not source control.
4. Run `npm run doctor` and `npm test`.
5. Reconnect local MCP entries if paths changed.
6. Reauthorize remote OAuth clients if hostnames, callbacks, or signing keys changed.
7. Run the two-direction acceptance test before enabling write mode.
