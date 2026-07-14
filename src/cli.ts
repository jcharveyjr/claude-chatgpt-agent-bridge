#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildAdapters } from "./adapters/index.js";
import { AgentBridgeBroker } from "./broker.js";
import { loadConfig } from "./config.js";
import { TaskStore } from "./store.js";
import { startHttpServer } from "./transports/http.js";
import { startStdioServer } from "./transports/stdio.js";

function loadEnvFileIfPresent(): void {
  const envPath = resolve(process.env.AGENT_BRIDGE_ENV_FILE ?? ".env");
  if (typeof process.loadEnvFile !== "function" || !existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    process.stderr.write(`Ignoring malformed env file at ${envPath}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

async function main(): Promise<void> {
  loadEnvFileIfPresent();
  const mode = process.argv[2] ?? "stdio";
  if (mode !== "stdio" && mode !== "http" && mode !== "status") {
    throw new Error("Usage: agent-bridge [stdio|http|status]");
  }
  const config = await loadConfig();

  if (mode === "status") {
    const { collectStatus, formatStatus } = await import("./status.js");
    const report = await collectStatus(config);
    const asJson = process.argv.includes("--json");
    process.stdout.write(`${asJson ? JSON.stringify(report, null, 2) : formatStatus(report)}\n`);
    return;
  }

  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  const broker = new AgentBridgeBroker(config, store, buildAdapters(config));
  await broker.initialize();

  if (mode === "stdio") {
    await startStdioServer(broker);
    return;
  }

  const server = await startHttpServer(broker, config);
  process.stderr.write(`Agent bridge listening at ${server.url}/mcp\n`);
  const shutdown = async () => {
    await server.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
