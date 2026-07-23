# Release Notes — v0.1.10

**Release date:** July 23, 2026
**Type:** Runtime metadata patch

Agent Bridge v0.1.10 supersedes v0.1.9. Final live verification of v0.1.9
correctly launched the released files but exposed stale hardcoded version
metadata: the health endpoint and MCP surfaces still identified the broker as
v0.1.7 or v0.1.0.

## Fixed

- Runtime instance metadata now reports v0.1.10.
- Broker capabilities and MCP server identification use the same centralized
  `BRIDGE_VERSION` value.
- A regression test requires runtime metadata and capabilities to match
  `package.json`, preventing a future package-only version bump.

## Security

The v0.1.9 dependency fix is retained: `fast-uri` remains locked at 3.1.4,
with zero high or critical audit findings. The two documented moderate,
unreachable Hono `serveStatic` advisories remain unchanged.

## Validation

The candidate passes doctor, type checking, all 50 tests, production build,
HTTP smoke, and coverage at 77.92% lines, 73.89% branches, and 81.71%
functions. Audit review reports zero high or critical findings. CI, sanitized
ZIP inspection, and final live health/MCP/provider verification complete the
release gate.
