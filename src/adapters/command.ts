import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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
  const spawnCommand = requiresWindowsShell ? `"${executable}"` : executable;
  const hasInput = options.input !== undefined;
  return new Promise((resolve, reject) => {
    const child = spawn(spawnCommand, options.args, {
      cwd: options.cwd,
      env: options.env,
      shell: requiresWindowsShell,
      stdio: [hasInput ? "pipe" : "ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let completedFromOutput = false;
    const timeout = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);
    const abort = () => child.kill("SIGTERM");
    options.signal.addEventListener("abort", abort, { once: true });

    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-maxOutput);
      if (!completedFromOutput && options.completionMarker && stdout.includes(options.completionMarker)) {
        completedFromOutput = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr!.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-maxOutput);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal.removeEventListener("abort", abort);
      if (options.signal.aborted) {
        reject(new Error("Delegated task was cancelled."));
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
