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
