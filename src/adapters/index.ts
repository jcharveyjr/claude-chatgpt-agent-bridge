import type { BridgeConfig } from "../config.js";
import type { AgentAdapter, AgentName } from "../types.js";
import { ClaudeCliAdapter } from "./claude-cli.js";
import { CodexCliAdapter } from "./codex-cli.js";
import { MockAdapter } from "./mock.js";

export function buildAdapters(config: BridgeConfig): Record<AgentName, AgentAdapter> {
  return {
    claude: buildAdapter("claude", config),
    codex: buildAdapter("codex", config)
  };
}

function buildAdapter(name: AgentName, config: BridgeConfig): AgentAdapter {
  const agent = config.agents[name];
  switch (agent.adapter) {
    case "claude-cli":
      if (name !== "claude") throw new Error("claude-cli adapter can only be assigned to claude");
      return new ClaudeCliAdapter(agent);
    case "codex-cli":
      if (name !== "codex") throw new Error("codex-cli adapter can only be assigned to codex");
      return new CodexCliAdapter(agent);
    case "mock":
      return new MockAdapter(name);
  }
}
