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
        return candidate;
      } catch {
        // Continue searching PATH.
      }
    }
  }
  return undefined;
}

export function runCommand(options: {
  command: string;
  args: string[];
  cwd: string;
  input?: string;
  signal: AbortSignal;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  maxOutputCharacters?: number;
}): Promise<CommandResult> {
  const maxOutput = options.maxOutputCharacters ?? 2_000_000;
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);
    const abort = () => child.kill("SIGTERM");
    options.signal.addEventListener("abort", abort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-maxOutput);
    });
    child.stderr.on("data", (chunk: string) => {
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
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
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
