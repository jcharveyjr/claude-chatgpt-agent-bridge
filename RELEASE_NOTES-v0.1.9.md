# Release Notes — v0.1.9

**Release date:** July 23, 2026
**Type:** Security patch

Agent Bridge v0.1.9 supersedes v0.1.8. It updates the locked `fast-uri`
dependency from 3.1.3 to 3.1.4, removing the high-severity host-confusion
advisory reported during the v0.1.8 installation audit.

## Security review

- `npm audit` reports zero high- or critical-severity vulnerabilities.
- Two moderate advisories remain in `@hono/node-server`, pulled transitively
  by `@modelcontextprotocol/sdk`.
- The affected Hono `serveStatic` handler is not imported or called by Agent
  Bridge. The local broker is also bound to loopback by default.
- npm's automated remediation proposes downgrading the MCP SDK outside the
  current dependency range. This release does not take that breaking downgrade;
  the residual advisory is documented pending an upstream non-breaking fix.

## Validation

The release candidate passed doctor, type checking, all 49 tests, production
build, HTTP smoke testing, and coverage at 77.91% lines, 73.89% branches, and
81.71% functions. Audit review reports zero high or critical findings. The
published ZIP is inspected to exclude local configuration, environment files,
task records, logs, and dependencies.

All v0.1.8 hardening and live bidirectional acceptance evidence remains valid;
this patch changes dependency metadata only.
