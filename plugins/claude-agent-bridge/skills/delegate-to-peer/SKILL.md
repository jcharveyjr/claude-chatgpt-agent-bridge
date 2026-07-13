---
name: delegate-to-peer
description: Delegate bounded, independent project work between Claude and Codex or ChatGPT through the Agent Bridge MCP tools, then retrieve and integrate the result. Use when a task would benefit from the peer model's independent review, implementation, research, or validation; when the user asks Claude and ChatGPT agents to work together; or when work can continue while an asynchronous peer task runs.
---

# Delegate to Peer

Use the Agent Bridge MCP tools by their base names even when the client prefixes them.

1. Call `agent_bridge_capabilities` before the first delegation in a session.
2. Choose the peer target:
   - From Claude, set `source_agent` to `claude` and `target_agent` to `codex`.
   - From Codex, set `source_agent` to `codex` and `target_agent` to `claude`.
   - From ChatGPT Work, set `source_agent` to `chatgpt` and choose `claude` for general peer work or `codex` for coding-focused work.
3. Delegate one bounded outcome with `delegate_task`. Include the workspace name, necessary context, explicit success criteria, and the least-permissive mode.
4. Continue independent work while the task is queued or running. Do not busy-wait.
5. Call `get_task` when the peer result is needed. If the task is not finished, wait for a meaningful work boundary before checking again.
6. Verify the returned work before integrating it. The requesting agent remains responsible for the final answer and validation.

## Guardrails

- Never delegate to the same agent as `source_agent`.
- Never ask the worker to call Agent Bridge again. The broker also injects this restriction.
- Pass `parent_task_id` for a true nested task. Do not evade the configured depth limit.
- Use `read_only` for analysis, review, planning, or research. Use `workspace_write` only when file edits are required.
- Do not send passwords, tokens, private keys, session cookies, or unrelated private data in task text or context.
- Do not delegate purchases, messages, publishing, deployments, permission changes, or destructive actions without the user's explicit authority and the destination runtime's own approval.
- Cancel obsolete work with `cancel_task`.

## Good Delegation Shape

Provide:

- One concrete deliverable
- Only the context needed for that deliverable
- Named workspace rather than an arbitrary filesystem path
- Observable success criteria
- Expected handoff, including files changed and validation performed

Avoid delegating tiny tasks whose coordination cost exceeds the work, tightly coupled edits in the same files, or decisions that require missing user input.
