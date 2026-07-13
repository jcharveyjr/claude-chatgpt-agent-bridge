import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AgentBridgeBroker } from "../broker.js";
import { createMcpServer } from "../mcp-server.js";

export async function startStdioServer(broker: AgentBridgeBroker): Promise<void> {
  const server = createMcpServer(broker);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
