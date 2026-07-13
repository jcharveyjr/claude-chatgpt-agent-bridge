import type { BridgeTask } from "./types.js";

export function buildDelegationPrompt(task: BridgeTask): string {
  const criteria = task.successCriteria.length
    ? task.successCriteria.map((criterion, index) => `${index + 1}. ${criterion}`).join("\n")
    : "Return a concise result with evidence of any validation performed.";

  return [
    "You are the execution agent for a task delegated through a cross-vendor agent bridge.",
    "Complete the task in the current workspace and return a concise handoff to the requesting agent.",
    "Do not call the agent bridge or delegate this task back to another model. This prevents circular delegation.",
    `Permission mode: ${task.mode}.`,
    task.mode === "read_only"
      ? "Inspect and report only. Do not modify files or external systems."
      : "You may edit files inside the current workspace. Do not publish, push, send, purchase, deploy, or change external systems unless the task explicitly says so and the runtime independently authorizes it.",
    "",
    "Task:",
    task.task,
    task.context ? `\nContext:\n${task.context}` : "",
    "",
    "Success criteria:",
    criteria,
    "",
    "Handoff format:",
    "- Outcome",
    "- Files changed (if any)",
    "- Validation performed",
    "- Remaining risks or blockers"
  ].filter((line) => line !== "").join("\n");
}
