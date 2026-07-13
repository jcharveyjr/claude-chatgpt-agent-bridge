#!/usr/bin/env node
import { join } from "node:path";
import { buildAdapters } from "./adapters/index.js";
import { AgentBridgeBroker } from "./broker.js";
import { loadConfig } from "./config.js";
import { TaskStore } from "./store.js";
import { startHttpServer } from "./transports/http.js";
import { startStdioServer } from "./transports/stdio.js";

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "stdio";
  if (mode !== "stdio" && mode !== "http") {
    throw new Error("Usage: agent-bridge [stdio|http]");
  }
  const config = await loadConfig();
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
