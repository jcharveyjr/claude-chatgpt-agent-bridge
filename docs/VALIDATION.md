# Validation and Compatibility

Validated on July 13, 2026.

## Bottom Line

The goal is possible, but not as a native direct link between two chat windows. Claude and ChatGPT/Codex do not expose a built-in cross-vendor subagent primitive. They can both call MCP tools, so the reliable design is a shared MCP broker that records tasks and invokes the target worker.

The referenced [Connect to Claude & ChatGPT video](https://www.youtube.com/watch?v=XXAFdTTQSaw) is a 7:47 Cognito Forms tutorial. Its published description says it connects one Cognito Forms organization to AI tools so either can create or update entries. That validates the shared external tool pattern, not direct delegation between the models. Closed captions were unavailable during review, so no transcript claims are used here.

## Product Evidence

- MCP is an open standard that lets applications including Claude and ChatGPT connect to data, tools, and workflows. [MCP introduction](https://modelcontextprotocol.io/docs/getting-started/intro)
- Codex local clients support stdio and Streamable HTTP MCP. ChatGPT web uses remote MCP tools supplied by plugins rather than local Codex configuration. [OpenAI MCP guide](https://learn.chatgpt.com/docs/extend/mcp)
- ChatGPT's desktop import can migrate supported Claude instructions, skills, plugins, MCP settings, hooks, commands, and subagents. Import is a one-time copy, not live coordination. [OpenAI agent import guide](https://learn.chatgpt.com/docs/import)
- Claude Code supports local stdio and remote HTTP MCP servers. [Claude Code MCP guide](https://docs.anthropic.com/en/docs/claude-code/mcp)
- Claude custom connectors use remote MCP from Claude's cloud, so the server must be publicly reachable. [Claude custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- Claude plugins can bundle skills, connectors, and subagents; plugin skills work in chat and Cowork, while hooks and subagents are Cowork-only. [Claude plugin guide](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)
- Claude Code can run non-interactively with `claude -p`, and Codex can run non-interactively with `codex exec`, which makes both viable worker adapters. [Claude CLI reference](https://code.claude.com/docs/en/cli-reference), [Codex non-interactive guide](https://learn.chatgpt.com/docs/non-interactive-mode)

## Compatibility Matrix

| Surface | Local broker | Hosted broker | Delegation result |
| --- | --- | --- | --- |
| Claude Code | Yes, stdio or HTTP | Yes, remote HTTP | Full peer task submission and retrieval |
| Codex CLI | Yes, stdio or HTTP | Yes, remote HTTP | Full peer task submission and retrieval |
| Codex IDE extension | Yes; shares Codex MCP configuration | Yes | Full tools when MCP is enabled |
| ChatGPT desktop app / Codex | Yes; shares local Codex MCP configuration | Yes | Full tools when MCP is enabled |
| ChatGPT Work on web | No local config | Yes, through a remote MCP-backed app/plugin | Full tools after workspace/plugin authorization |
| ChatGPT workspace agents | No local config | Yes where the agent can use the installed app/plugin | Full tools subject to agent and workspace policy |
| Claude Cowork | Local plugin components may load on desktop, but custom connectors are cloud-reached | Yes, remote custom connector | Full tools after connector authorization |
| Claude web chat | No local stdio | Yes, remote custom connector | Full tools where connectors are available |

## Tests That Passed

The repository test suite currently proves:

1. Task creation, persistence, filtering, and status updates
2. Restart recovery for interrupted tasks
3. Cross-agent routing through independent worker adapters
4. Same-agent rejection and delegation-depth enforcement
5. Cancellation of running tasks
6. MCP Streamable HTTP initialization, session handling, tool discovery, and tool invocation using the official TypeScript client SDK
7. TypeScript strict type checking and production compilation

Commands used:

```bash
npm run typecheck
npm test
npm run build
```

## Not Yet Proven in This Build Environment

The build environment did not contain authenticated `claude` or `codex` executables, so live paid-model task execution was not run here. The adapters are implemented against the current official CLI interfaces and the included `npm run doctor` command checks both executables on the installation host.

ChatGPT Work and Claude Cowork require a real HTTPS deployment plus connector authorization. The server implements bearer authentication and OAuth JWT verification, but completing those account-specific UI steps requires the user's OAuth tenant, public hostname, and enabled workspace features.
