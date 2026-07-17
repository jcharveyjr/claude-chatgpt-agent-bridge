import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { BridgeConfig } from "../src/config.js";

export async function testConfig(overrides: Partial<BridgeConfig> = {}): Promise<BridgeConfig> {
  const root = await mkdtemp(join(tmpdir(), "agent-bridge-test-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  return {
    configPath: join(root, "bridge.config.json"),
    projectRoot: root,
    dataDirectory: join(root, "data"),
    defaultWorkspace: "test",
    maxDelegationDepth: 2,
    maxTaskCharacters: 50_000,
    retention: { maxTasks: 1_000, maxAgeDays: 90 },
    workspaces: { test: workspace },
    agents: {
      claude: {
        adapter: "mock",
        command: "claude",
        enabled: true,
        timeoutMs: 1_000,
        maxTurns: 3
      },
      codex: {
        adapter: "mock",
        command: "codex",
        enabled: true,
        timeoutMs: 1_000
      }
    },
    http: {
      host: "127.0.0.1",
      port: 0,
      publicUrl: "http://127.0.0.1:0",
      allowedOrigins: ["https://chatgpt.com", "https://claude.ai"]
    },
    ...overrides
  };
}
