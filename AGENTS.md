# Agent Bridge Project Guidance

## Commands

- Install: `npm install`
- Type check: `npm run typecheck`
- Test: `npm test`
- Build: `npm run build`
- Release HTTP smoke test: `npm run smoke:http`
- Synchronize skill copies: `npm run sync:skills`
- Installation diagnostics: `npm run doctor`

## Working Rules

- Treat `skills/delegate-to-peer/SKILL.md` as the canonical skill source. Run `npm run sync:skills` after changing it.
- Keep task tools asynchronous. `delegate_task` returns an ID; `get_task` returns status and results.
- Preserve workspace allowlisting, source/target separation, and delegation-depth checks.
- Never add account cookies, session tokens, API keys, or real OAuth secrets to this repository.
- Prefer the single local HTTP broker for simultaneous Claude and Codex use. Do not run multiple stdio brokers against the same JSON task store.
- Run type checking, tests, and build before handing off changes.

Use the delegate-to-peer skill only when the user requests cross-agent work or a peer pass materially improves a bounded task. Never recursively delegate a task received from Agent Bridge.
