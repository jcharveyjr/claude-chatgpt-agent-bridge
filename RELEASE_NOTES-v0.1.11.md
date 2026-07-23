# Release Notes — v0.1.11

**Release date:** July 23, 2026
**Type:** Provider diagnostics patch

Agent Bridge v0.1.11 supersedes v0.1.10. Final provider verification reached
Claude successfully, but Anthropic rejected inference with HTTP 429 because the
account had reached its monthly spend limit. Claude Code emitted the useful
provider message as JSON on stdout while exiting nonzero; the bridge previously
reported only empty stderr.

## Fixed

- Nonzero Claude Code exits now extract a structured `result` message from
  stdout before falling back to stderr or bounded raw stdout.
- Empty provider failures now report an explicit fallback instead of a blank
  task error.
- Unit tests cover structured stdout, stderr, raw stdout, and empty failures.

## Validation

The v0.1.10 runtime metadata fix and v0.1.9 dependency fix are retained. The
candidate passes audit review with zero high/critical findings, doctor, type
checking, all 52 tests, build, HTTP smoke, and coverage at 77.95% lines,
74.32% branches, and 81.82% functions. Codex live task
`5ebbf648-5646-40a4-a3db-993fbbee8fab` passed on v0.1.10 with no file changes.
Claude remains externally blocked until the account spend limit is raised or
reset; CI, ZIP inspection, and installed-runtime checks complete the gate.
