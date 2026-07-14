# Hosted Deployment Guide (Public HTTPS + OAuth)

The local broker binds to loopback and needs no auth. To bring **ChatGPT Work**
and **Claude web / Cowork** into the bridge, the broker must be publicly
reachable over HTTPS and protected by OAuth/JWT. This guide documents the setup
and the decisions required before deployment.

> Nothing here is deployed automatically. Hosting and OAuth provider choices are
> yours; the steps below are provider-agnostic.

## Decisions required from you

1. **Hosting** — where the broker process runs and gets a public HTTPS hostname
   (e.g. a small VM/container behind a TLS-terminating proxy, or a PaaS). You
   will need a domain such as `https://bridge.example.com`.
2. **OAuth provider** — an issuer that mints JWT access tokens (e.g. Auth0,
   Okta, Entra ID, Keycloak, or your own). You need its issuer URL, a JWKS URL,
   and the ability to define an audience and a scope.
3. **Which web surfaces** you actually have access to (ChatGPT Work admin,
   Claude custom connectors) — this determines the final wiring step.

## Architecture

```
Claude web / Cowork ─┐
                     ├─ HTTPS ─▶ reverse proxy (TLS) ─▶ agent-bridge (HTTP) ─▶ claude/codex workers
ChatGPT Work ────────┘             validates JWT via JWKS
```

The broker validates the bearer JWT on every `/mcp` request: signature (via
JWKS), issuer, audience, and required scopes. When OAuth is configured it also
serves `/.well-known/oauth-protected-resource/mcp` so clients can discover the
authorization server.

## 1. Environment configuration

Set these (via `.env`, which is auto-loaded, or real environment variables):

```bash
AGENT_BRIDGE_HOST=0.0.0.0            # bind for the proxy; never expose raw
AGENT_BRIDGE_PORT=8787
AGENT_BRIDGE_PUBLIC_URL=https://bridge.example.com
AGENT_BRIDGE_OAUTH_ISSUER=https://your-tenant.example.com/
AGENT_BRIDGE_OAUTH_AUDIENCE=https://bridge.example.com/mcp
AGENT_BRIDGE_OAUTH_JWKS_URL=https://your-tenant.example.com/.well-known/jwks.json
AGENT_BRIDGE_OAUTH_SCOPES=agent_bridge:delegate
AGENT_BRIDGE_ALLOWED_ORIGINS=https://chatgpt.com,https://claude.ai
```

When issuer, audience, and JWKS are all set, JWT validation replaces the static
bearer token automatically. The broker refuses to start in OAuth mode unless
`AGENT_BRIDGE_PUBLIC_URL` is HTTPS.

## 2. TLS and reverse proxy

Terminate TLS at a proxy (nginx, Caddy, cloud LB) and forward to the broker on
loopback. Do not expose the raw HTTP port publicly. Forward the `Authorization`
and `Origin` headers unchanged.

## 3. Authorization server

- Create an API/resource with identifier equal to `AGENT_BRIDGE_OAUTH_AUDIENCE`.
- Define the scope `agent_bridge:delegate`.
- Note the issuer and JWKS URLs for the env vars above.
- Issue tokens to the clients/agents that may delegate.

## 4. Wire up the web surfaces

- **Claude web / Cowork:** add a remote custom connector pointing at
  `https://bridge.example.com/mcp`; authorize it through the OAuth flow.
- **ChatGPT Work:** register a remote MCP app/plugin pointing at the same URL,
  subject to workspace/admin approval.

Local Claude Code and Codex CLIs can also point at the hosted URL, but the
loopback broker remains the recommended path for local two-agent use.

## 5. Verify

```bash
curl https://bridge.example.com/health
# {"ok":true,"service":"agent-bridge"}

curl -i https://bridge.example.com/mcp           # 401 without a token
curl -s https://bridge.example.com/.well-known/oauth-protected-resource/mcp
```

A request with a valid bearer JWT (correct issuer, audience, and
`agent_bridge:delegate` scope) should complete the MCP initialize handshake.

## 6. Production hardening (before real multi-user use)

- Replace the JSON task store with a durable database (the current store is
  single-host and not safe for concurrent brokers).
- Add rate limiting, structured request logging, and metrics.
- Add backups and a rollback procedure.
- Review task records and logs before sharing; delegated prompts and results may
  contain project information.
- Consider per-client scopes and workspace restrictions.

## Security checklist

- [ ] HTTPS only; raw HTTP port not publicly reachable.
- [ ] OAuth issuer, audience, JWKS, and scopes set; static token unset.
- [ ] `AGENT_BRIDGE_ALLOWED_ORIGINS` restricted to expected surfaces.
- [ ] Provider CLI credentials stay on the worker host and are never returned.
- [ ] Task store and logs are access-controlled and rotated.
