import type { AgentConfig } from "../config.js";
import type { AgentAdapter, AgentRunRequest, AgentRunResult } from "../types.js";
import { findCommand, runCommand, workerEnvironment } from "./command.js";

interface CodexEvent {
  type?: string;
  item?: {
    type?: string;
    text?: string;
  };
  message?: string;
}

export class CodexCliAdapter implements AgentAdapter {
  public readonly name = "codex" as const;
  public readonly kind = "codex-cli";

  public constructor(private readonly config: AgentConfig) {}

  public async isAvailable(): Promise<{ available: boolean; detail: string }> {
    if (!this.config.enabled) return { available: false, detail: "disabled in configuration" };
    const executable = await findCommand(this.config.command);
    return executable
      ? { available: true, detail: executable }
      : { available: false, detail: `command '${this.config.command}' was not found in PATH` };
  }

  public async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const sandbox = request.task.mode === "read_only" ? "read-only" : "workspace-write";
    const args = [
      "--ask-for-approval",
      "never",
      "exec",
      "--ephemeral",
      "--json",
      "--sandbox",
      sandbox,
      "--skip-git-repo-check"
    ];
    if (this.config.model) args.push("--model", this.config.model);
    args.push(request.prompt);

    const completed = await runCommand({
      command: this.config.command,
      args,
      cwd: request.workspacePath,
      signal: request.signal,
      timeoutMs: this.config.timeoutMs,
      env: workerEnvironment("codex"),
      completionMarker: '"type":"turn.completed"'
    });
    if (completed.exitCode !== 0) {
      throw new Error(`Codex exited with ${completed.exitCode}: ${completed.stderr.trim()}`);
    }

    const events: CodexEvent[] = [];
    for (const line of completed.stdout.split(/\r?\n/).filter(Boolean)) {
      try {
        events.push(JSON.parse(line) as CodexEvent);
      } catch {
        // Ignore non-JSON progress lines; the final result still must be present below.
      }
    }
    const failure = events.findLast((event) => event.type === "turn.failed" || event.type === "error");
    if (failure) throw new Error(failure.message ?? "Codex reported a failed turn.");
    const messages = events
      .filter((event) => event.type === "item.completed" && event.item?.type === "agent_message")
      .map((event) => event.item?.text?.trim())
      .filter((text): text is string => Boolean(text));
    const output = messages.at(-1);
    if (!output) throw new Error("Codex completed without an agent message in its JSONL output.");
    return { output };
  }
}
