# Security

## Non-Negotiable Rules

1. Do not place ChatGPT cookies, Claude cookies, browser session tokens, or long-lived secrets in `bridge.config.json`, skill files, prompts, or task context.
2. Keep `bridge.config.json`, `.env`, and `.agent-bridge/` out of version control.
3. Use named workspace allowlists. Do not expose arbitrary filesystem paths as tool input.
4. Bind to `127.0.0.1` for local use.
5. Do not expose HTTP publicly without HTTPS and either OAuth/JWT validation or a high-entropy bearer token.
6. Use OAuth for ChatGPT Work or Claude Cowork. Treat the static token mode as a local or tightly controlled administrative option.
7. Run the bridge under a dedicated operating-system account with access only to the required project folders.
8. Keep `maxDelegationDepth` low. The default of two prevents uncontrolled cross-agent loops.
9. Start with `read_only`; use `workspace_write` only when the peer must edit files.
10. Review queued and completed tasks because task text and results may contain sensitive project information.

## OAuth Mode

Agent Bridge acts as an OAuth protected resource, not as the authorization server. Configure a trusted OAuth provider that issues JWT access tokens, then set:

- `AGENT_BRIDGE_PUBLIC_URL`
- `AGENT_BRIDGE_OAUTH_ISSUER`
- `AGENT_BRIDGE_OAUTH_AUDIENCE`
- `AGENT_BRIDGE_OAUTH_JWKS_URL`
- `AGENT_BRIDGE_OAUTH_SCOPES`

The server publishes protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`, validates JWT signature, issuer, audience, and required scopes, and advertises the metadata URL on unauthorized responses.

## Worker Isolation

The Claude worker does not inherit OpenAI or Codex API-key environment variables. The Codex worker does not inherit the Anthropic API key. Neither worker inherits `AGENT_BRIDGE_TOKEN`. This reduces accidental cross-provider credential exposure, but it is not a substitute for a dedicated host account and least-privilege filesystem permissions.

## Actions Requiring Independent Approval

Delegation does not authorize publishing, sending messages, purchases, deployments, permission changes, destructive operations, or access outside configured workspaces. Each worker runtime must still enforce its own sandbox and approval policy.
