import type { AgentConfig } from "../config.js";
import type { AgentAdapter, AgentRunRequest, AgentRunResult, WorkerAvailability } from "../types.js";
import { findCommand, runCommand, workerEnvironment } from "./command.js";

interface ClaudeJsonResult {
  result?: string;
  is_error?: boolean;
  session_id?: string;
  total_cost_usd?: number;
}

export function claudeFailureDetail(stdout: string, stderr: string): string {
  try {
    const parsed = JSON.parse(stdout) as ClaudeJsonResult;
    if (parsed.result?.trim()) return parsed.result.trim();
  } catch {
    // Fall through to the raw process output.
  }
  return stderr.trim() || stdout.trim().slice(0, 500) || "no error detail returned";
}

export class ClaudeCliAdapter implements AgentAdapter {
  public readonly name = "claude" as const;
  public readonly kind = "claude-cli";

  public constructor(private readonly config: AgentConfig) {}

  public async isAvailable(): Promise<WorkerAvailability> {
    if (!this.config.enabled) {
      return {
        installed: false,
        commandFound: false,
        readiness: "unknown",
        providerCheck: "not performed",
        detail: "disabled in configuration"
      };
    }
    const executable = await findCommand(this.config.command);
    if (!executable) {
      return {
        installed: false,
        commandFound: false,
        readiness: "unknown",
        providerCheck: "not performed",
        detail: `command '${this.config.command}' was not found in PATH`
      };
    }
    return {
      installed: true,
      commandFound: true,
      executablePath: executable,
      readiness: "unknown",
      providerCheck: "not performed",
      detail: `found at ${executable}; readiness not verified (no auth/quota check performed)`
    };
  }

  public async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const permissionMode = request.task.mode === "read_only" ? "plan" : "acceptEdits";
    const args = [
      "-p",
      "--output-format",
      "json",
      "--no-session-persistence",
      "--permission-mode",
      permissionMode,
      "--max-turns",
      String(this.config.maxTurns ?? 30)
    ];
    if (this.config.model) args.push("--model", this.config.model);

    const completed = await runCommand({
      command: this.config.command,
      args,
      cwd: request.workspacePath,
      input: request.prompt,
      signal: request.signal,
      timeoutMs: this.config.timeoutMs,
      env: workerEnvironment("claude")
    });
    if (completed.exitCode !== 0) {
      throw new Error(
        `Claude Code exited with ${completed.exitCode}: ${claudeFailureDetail(completed.stdout, completed.stderr)}`
      );
    }

    let parsed: ClaudeJsonResult;
    try {
      parsed = JSON.parse(completed.stdout) as ClaudeJsonResult;
    } catch {
      throw new Error(`Claude Code returned invalid JSON: ${completed.stdout.slice(0, 500)}`);
    }
    if (parsed.is_error) throw new Error(parsed.result ?? "Claude Code reported an error.");
    return {
      output: parsed.result?.trim() || "Claude Code completed without a text result.",
      metadata: {
        ...(parsed.session_id ? { sessionId: parsed.session_id } : {}),
        ...(parsed.total_cost_usd !== undefined ? { totalCostUsd: parsed.total_cost_usd } : {})
      }
    };
  }
}
