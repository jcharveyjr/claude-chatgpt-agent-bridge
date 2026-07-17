import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Compose a single, safely quoted command line for the Windows shell path.
 * Node deprecates (DEP0190) passing an args array together with { shell: true },
 * so on Windows .cmd/.bat launchers we pre-join the executable and its arguments
 * and spawn with an empty args array instead. Each token is wrapped in double
 * quotes with embedded quotes doubled, which cmd.exe parses correctly.
 */
export function buildWindowsShellCommand(executable: string, args: string[]): string {
  const quote = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  return [quote(executable), ...args.map(quote)].join(" ");
}

/**
 * Terminate a worker and its entire descendant tree.
 *
 * `child.kill()` on Windows sends the signal only to the direct child, which is
 * usually the cmd.exe/.cmd launcher wrapper — the real worker runs as a
 * grandchild and would survive. On POSIX the same is true unless the child is a
 * process-group leader. This kills the whole tree so no worker is left running
 * after a timeout or cancellation.
 */
export function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return Promise.resolve();
  if (process.platform === "win32") {
    // Windows: taskkill /T walks the whole descendant tree (the real worker runs
    // as a grandchild of the .cmd launcher). Resolve only once taskkill has exited
    // so callers can sequence escalation deterministically instead of racing it.
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      let killer: ChildProcess;
      try {
        killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
          windowsHide: true,
          stdio: "ignore"
        });
      } catch {
        // taskkill could not be launched at all; fall back to a direct force-kill.
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
        finish();
        return;
      }
      killer.once("error", () => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
        finish();
      });
      killer.once("exit", finish);
      // Safety valve: never let a stuck taskkill hold cleanup open indefinitely.
      const guard = setTimeout(finish, 5_000);
      guard.unref?.();
    });
  }
  // POSIX: the child was spawned detached, so it leads its own process group;
  // a negative pid signals the whole group in one call. Resolve synchronously.
  return new Promise<void>((resolve) => {
    try {
      process.kill(-pid, signal);
    } catch {
      try { child.kill(signal); } catch { /* already gone */ }
    }
    resolve();
  });
}

export async function findCommand(command: string): Promise<string | undefined> {
  if (isAbsolute(command)) {
    try {
      await access(command, constants.X_OK);
      return command;
    } catch {
      return undefined;
    }
  }

  const pathEntries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
    : [""];
  for (const directory of pathEntries) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`);
      try {
        await access(candidate, constants.X_OK);
        if (command.toLowerCase() === "codex" && /\.cmd$/i.test(candidate)) {
          const nativeCodex = join(
            directory,
            "node_modules",
            "@openai",
            "codex",
            "node_modules",
            "@openai",
            "codex-win32-x64",
            "vendor",
            "x86_64-pc-windows-msvc",
            "bin",
            "codex.exe"
          );
          try {
            await access(nativeCodex, constants.X_OK);
            return nativeCodex;
          } catch {
            // Fall back to the npm launcher when the native optional package is unavailable.
          }
        }
        return candidate;
      } catch {
        // Continue searching PATH.
      }
    }
  }
  return undefined;
}

export async function runCommand(options: {
  command: string;
  args: string[];
  cwd: string;
  input?: string;
  signal: AbortSignal;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  maxOutputCharacters?: number;
  completionMarker?: string;
}): Promise<CommandResult> {
  const maxOutput = options.maxOutputCharacters ?? 2_000_000;
  const executable = await findCommand(options.command);
  if (!executable) throw new Error(`Command '${options.command}' was not found in PATH.`);
  const requiresWindowsShell = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(executable);
  // Avoid DEP0190: never pass an args array together with shell:true. On the
  // Windows shell path we compose a single quoted command line instead.
  const spawnCommand = requiresWindowsShell
    ? buildWindowsShellCommand(executable, options.args)
    : executable;
  const spawnArgs = requiresWindowsShell ? [] : options.args;
  const hasInput = options.input !== undefined;
  return new Promise((resolve, reject) => {
    const child = spawn(spawnCommand, spawnArgs, {
      cwd: options.cwd,
      env: options.env,
      shell: requiresWindowsShell,
      // POSIX: give the worker its own process group so the whole tree can be
      // signalled. Windows terminates the tree with taskkill instead.
      detached: process.platform !== "win32",
      stdio: [hasInput ? "pipe" : "ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let completedFromOutput = false;
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let killing = false;
    const killTree = () => {
      // One coordinated shutdown: guard against duplicate taskkills / settlement
      // when several triggers (timeout, cancel, completion marker) fire together.
      if (killing) return;
      killing = true;
      // Bounded escalation: force-kill the tree if graceful termination stalls.
      forceKillTimer = setTimeout(() => {
        void terminateProcessTree(child, "SIGKILL");
      }, 3_000);
      forceKillTimer.unref?.();
      // Graceful: terminate the whole tree. On Windows, taskkill /T already covers
      // the launcher and its descendants, so we deliberately do NOT also signal the
      // direct child here - doing so could kill the launcher before taskkill walks
      // the tree and orphan the real worker (the exact race this fixes). On POSIX the
      // process-group signal inside terminateProcessTree covers the whole tree.
      void terminateProcessTree(child, "SIGTERM");
    };
    // Ignore EPIPE if the worker exits before consuming all of stdin.
    child.stdin?.on("error", () => { /* worker closed stdin early */ });
    const timeout = setTimeout(() => {
      timedOut = true;
      killTree();
    }, options.timeoutMs);
    const abort = () => killTree();
    options.signal.addEventListener("abort", abort, { once: true });

    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-maxOutput);
      if (!completedFromOutput && options.completionMarker && stdout.includes(options.completionMarker)) {
        completedFromOutput = true;
        killTree();
      }
    });
    child.stderr!.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-maxOutput);
    });
    const cleanup = () => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      options.signal.removeEventListener("abort", abort);
      // Destroy stdin so a half-written pipe to an exited worker cannot keep the
      // event loop (or a test runner) alive.
      try { child.stdin?.destroy(); } catch { /* already closed */ }
    };
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (options.signal.aborted) {
        reject(new Error("Delegated task was cancelled."));
        return;
      }
      if (timedOut && !completedFromOutput) {
        reject(new Error(`Command '${options.command}' timed out after ${options.timeoutMs} ms.`));
        return;
      }
      resolve({ stdout, stderr, exitCode: completedFromOutput ? 0 : (code ?? 1) });
    });

    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

export function workerEnvironment(target: "claude" | "codex"): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.AGENT_BRIDGE_TOKEN;
  if (target === "claude") {
    delete environment.OPENAI_API_KEY;
    delete environment.CODEX_API_KEY;
  } else {
    delete environment.ANTHROPIC_API_KEY;
  }
  return environment;
}
