# Development Workflow

This guide describes a repeatable local development setup for Agent Bridge on
Windows (the same steps work on macOS/Linux with path adjustments). The goal is a
dedicated **development clone** that is a real Git working tree, kept separate
from the running install, so that local Git handles anything — including
`.github/workflows/` files — while an AI connector can handle quick edits.

## Why a separate dev clone

- The live broker typically runs from a runtime folder (for example
  `C:\Users\<you>\Documents\AgentBridge`) that may not be a Git working tree.
- GitHub App connectors can be blocked from writing `.github/workflows/` files
  (they need a dedicated "Workflows" permission). Pushes from your own local
  clone act as **you** and have no such restriction.
- A clean clone keeps runtime files (`bridge.config.json`, `.env`,
  `.agent-bridge/`, logs) out of version control — they are already gitignored.

## 1. One-time setup

```powershell
cd C:\Users\<you>\Documents
git clone https://github.com/jcharveyjr/claude-chatgpt-agent-bridge.git AgentBridge-dev
cd AgentBridge-dev
npm install
```

On first push, Git Credential Manager (bundled with Git for Windows) prompts you
to sign in to GitHub and then remembers it — no manual token handling required.

## 2. Daily loop

```powershell
cd C:\Users\<you>\Documents\AgentBridge-dev
git pull                                       # pick up connector/other commits
# ...make edits...
npm run typecheck; npm test; npm run build     # the same checks CI runs
git add -A
git commit -m "clear, imperative message"
git push                                        # workflow files included
```

Pushing triggers CI (`.github/workflows/ci.yml`), which runs type check, tests,
build, and the HTTP smoke test on Node 20 and 22.

## 3. Division of labor

- **From chat (AI + connector):** quick edits to source, docs, tests, and config
  — anything not under `.github/workflows/`. Fast, no local step.
- **From the dev clone (local Git):** workflow files, release tags, or any batch
  of changes you want to validate before pushing.
- Both push to the same `main`, so run `git pull` in the dev clone before you
  start to pick up anything committed via the connector.

## 4. Cutting a release

```powershell
git pull
git tag -a v0.1.9 -m "Agent Bridge v0.1.9"
git push origin v0.1.9
gh release create v0.1.9 --notes-file RELEASE_NOTES-v0.1.9.md
```

No `gh` CLI? Push the tag, then on GitHub go to **Releases -> Draft a new
release**, choose the `v0.1.9` tag, and paste the contents of
`RELEASE_NOTES-v0.1.9.md`.

## 5. Keeping the runtime in sync

Once a change is validated and pushed from the dev clone, either repoint the
Windows sign-in startup entry at `AgentBridge-dev`, or copy the built files into
the runtime folder. Long term, running the broker directly from the Git clone is
simplest: one source of truth instead of two.

## 6. Pre-push checklist

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run smoke:http` passes (optional locally; CI runs it).
- [ ] No runtime files staged (`bridge.config.json`, `.env`, `.agent-bridge/`).
- [ ] After editing `skills/delegate-to-peer/SKILL.md`, ran `npm run sync:skills`.
