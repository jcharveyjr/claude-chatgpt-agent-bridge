# Windows Installation Log

Installation host: Windows 11 desktop (`DESKTOP-50IKOHS`)  
Installation date: July 13, 2026 (America/Chicago)

## Verified prerequisites

- Node.js `v24.15.0`
- Claude Code `2.1.207`
- Codex CLI `0.144.3`, installed with `npm install -g @openai/codex`
- Codex authentication status: signed in with ChatGPT

## Successful setup stages

The bridge was copied to `C:\Users\JC Harvey\Documents\AgentBridge` and the local setup command completed these stages:

1. Installed 99 dependency packages; the final 100-package audit reported zero vulnerabilities.
2. Created `bridge.config.json` from the loopback-only example.
3. Synchronized the delegation skill to all four project destinations.
4. Passed strict TypeScript checking.
5. Passed all 11 automated tests.
6. Built the production JavaScript.
7. Started the compiled server on a temporary loopback port and passed its health check.
8. Registered `http://127.0.0.1:8787/mcp` with Claude Code.
9. Registered the same MCP endpoint globally with Codex.

## Windows compatibility correction

The first final doctor run reported Codex as unavailable even though `codex --version` and `codex login status` worked in PowerShell. The cause was Windows npm exposing Codex through a `.cmd` launcher while the doctor used direct process execution. Version 0.1.2 added Windows shell-aware command checks and worker launching. Claude prompts are passed through standard input so delegated prompt content is not embedded in the Windows command line.

The first Claude-to-Codex handoff then showed that the resolved launcher path, `C:\Users\JC Harvey\AppData\Roaming\npm\codex.CMD`, also required explicit quoting because the Windows username contains a space. Version 0.1.3 quotes resolved `.cmd` and `.bat` launcher paths before shell execution.

After the launcher started correctly, the noninteractive Codex worker waited on the CLI's default interactive approval policy. Version 0.1.4 passes `--ask-for-approval never` to the worker while retaining the bridge-selected `read-only` or `workspace-write` sandbox and named workspace allowlist.

Testing also showed that stdin was not forwarded reliably through the npm `.cmd` shim. Version 0.1.5 makes the Windows installer detect and configure the native `codex.exe` distributed inside the official `@openai/codex-win32-x64` package. Native execution avoids shell quoting and stdin forwarding problems.

Version 0.1.6 passes the delegated prompt as Codex's documented positional prompt argument instead of stdin and also resolves the native binary automatically when a default `codex.CMD` launcher is found.

The final lifecycle issue was subtler: Codex emitted a valid `turn.completed` JSON event but kept the Windows process alive. Version 0.1.7 treats that documented terminal event as successful completion, terminates the lingering worker, and sends no-input commands to the OS null device. A regression test launches a process that prints the marker and intentionally stays alive; the bridge now captures the output and closes it successfully.

Codex's elevated Windows sandbox initially selected the Microsoft Store `pwsh.exe` alias, which cannot be launched through `CreateProcessAsUserW`. A user-local compatibility copy at `C:\Users\JC Harvey\.local\bin\pwsh.exe` now resolves before the Store alias. A direct read-only Codex command subsequently executed PowerShell successfully without weakening the Codex sandbox.

## Completed acceptance checks

- Codex to Claude task `98d8c7ba-8cc2-40f4-9f23-6b5f268906f5` completed. Claude inspected `package.json`, reported the name, version, and 11 scripts present in version 0.1.2, and changed no files.
- Claude to Codex task `ef588e96-5290-461c-bb01-bcbd64624685` completed in 13 seconds under version 0.1.7. Codex reported default workspace `bridge`, host `127.0.0.1`, and port `8787`, and changed no files.
- The repeatable setup was run again after the fixes. Node, Claude, Codex, config, type checking, all 11 tests, production build, health smoke test, both MCP registrations, and the final doctor all passed.
- The detached Windows start and stop scripts were exercised successfully. The current login startup entry is `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AgentBridge.cmd`.

The installed project is `C:\Users\JC Harvey\Documents\AgentBridge`. The local health endpoint is `http://127.0.0.1:8787/health`; runtime logs and the detached PID file are under `.agent-bridge`.

## Hardening iteration — July 14, 2026 (Claude implementation track)

Performed in the clean development clone `C:\Users\JC Harvey\Documents\AgentBridge-dev`;
the known-good runtime at `C:\Users\JC Harvey\Documents\AgentBridge` was not
touched. Worker timeout/cancellation now terminates the entire process tree
(Windows `taskkill /T`, POSIX process group) with a force-kill escalation, and
`stdin` is destroyed on settle so an early-exiting worker cannot leave a dangling
handle. `doctor` was updated to avoid Node DEP0190 on Windows.

Directly verified on this host (Node v24.15.0): `npm run doctor` PASS (with a
local gitignored config), `npm run typecheck`, `npm test` (27/27),
`npm run build`, `npm run smoke:http`, and `npm run coverage` all pass, and
`agent-bridge status` reported the live broker as healthy.

Not verified this iteration (Codex quota-blocked): live bidirectional read-only
and `workspace_write` handoffs with real task IDs, and live confirmation that no
worker process lingers after a real Codex handoff. The `taskkill` tree reaper did
not emit events inside the Claude Desktop sandbox, so a live check on a normal
Windows session is recommended; the direct `child.kill()` guarantees the bridge
promise settles regardless.

## v0.1.8 release acceptance — July 23, 2026

The hardened development build was tested on an isolated loopback broker at
`127.0.0.1:39787` with a disposable Git repository under Documents. The first
attempt exposed that the harness's temp-directory default resolved through the
sandbox-blocked `JCHARV~1` short path. The default was changed to Documents and
the complete acceptance sequence was rerun.

- ChatGPT to Claude `workspace_write` task
  `6b5789cd-2f80-4231-88a6-958dbefbebdc` created a 12-byte `hello.txt`
  containing exactly `HELLO_BRIDGE`; no other file changed.
- ChatGPT to Codex `workspace_write` task
  `7141e2b3-79cf-46da-a314-a71a51cff293` produced the same exact result.
- Codex read-only task `bc169c2f-27ba-45f1-87f6-ccf27d48ed20` was denied write
  access; `hello.txt` was absent and the disposable repository stayed clean.
- Live MCP calls rejected an unknown workspace and a same-source/target task.
- No Claude Code or Codex CLI worker remained after completion.
- Test-broker stderr contained no DEP0190 or other deprecation warning.
- Doctor, typecheck, 49/49 tests, build, HTTP smoke, and coverage passed. Coverage
  measured 77.91% lines, 73.89% branches, and 81.71% functions.


## v0.1.9 security patch — July 23, 2026

The published v0.1.8 ZIP was installed into the active directory with the
broker kept offline during verification. `npm ci` reported one high and two
moderate transitive advisories. The high finding was `fast-uri` 3.1.3 host
confusion; v0.1.9 locks `fast-uri` 3.1.4.

The patch candidate passes doctor, typecheck, 49/49 tests, build, HTTP smoke,
and coverage (77.91% lines, 73.89% branches, 81.71% functions). `npm audit
--audit-level=high` passes with zero high or critical findings. Two moderate
`@hono/node-server` `serveStatic` advisories remain transitive through the
MCP SDK. Agent Bridge does not import or call that handler and binds locally to
loopback by default; the npm-proposed forced SDK downgrade was not taken.
