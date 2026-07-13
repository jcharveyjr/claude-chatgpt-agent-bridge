import type { AgentConfig } from "../config.js";
import type { AgentAdapter, AgentRunRequest, AgentRunResult } from "../types.js";
import { findCommand, runCommand, workerEnvironment } from "./command.js";

interface ClaudeJsonResult {
  result?: string;
  is_error?: boolean;
  session_id?: string;
  total_cost_usd?: number;
}

export class ClaudeCliAdapter implements AgentAdapter {
  public readonly name = "claude" as const;
  public readonly kind = "claude-cli";

  public constructor(private readonly config: AgentConfig) {}

  public async isAvailable(): Promise<{ available: boolean; detail: string }> {
    if (!this.config.enabled) return { available: false, detail: "disabled in configuration" };
    const executable = await findCommand(this.config.command);
    return executable
      ? { available: true, detail: executable }
      : { available: false, detail: `command '${this.config.command}' was not found in PATH` };
  }

  public async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const permissionMode = request.task.mode === "read_only" ? "plan" : "acceptEdits";
    const args = [
      "-p",
      request.prompt,
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
      signal: request.signal,
      timeoutMs: this.config.timeoutMs,
      env: workerEnvironment("claude")
    });
    if (completed.exitCode !== 0) {
      throw new Error(`Claude Code exited with ${completed.exitCode}: ${completed.stderr.trim()}`);
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
