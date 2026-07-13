import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MockAdapter } from "../src/adapters/mock.js";
import { AgentBridgeBroker } from "../src/broker.js";
import { TaskStore } from "../src/store.js";
import { startHttpServer } from "../src/transports/http.js";
import { testConfig } from "./helpers.js";

test("HTTP transport completes an MCP initialize, list, and tool call", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  const broker = new AgentBridgeBroker(config, store, {
    claude: new MockAdapter("claude"),
    codex: new MockAdapter("codex")
  });
  await broker.initialize();
  const http = await startHttpServer(broker, config);
  const client = new Client({ name: "agent-bridge-test", version: "1.0.0" });

  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${http.url}/mcp`)));
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "delegate_task"));
    const result = await client.callTool({ name: "agent_bridge_capabilities", arguments: {} });
    assert.notEqual(result.isError, true);
    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content.find((item) => item.type === "text");
    assert.ok(text?.text);
    assert.match(text.text, /maxDelegationDepth/);
  } finally {
    await client.close();
    await http.close();
  }
});

test("HTTP transport enforces a configured bearer token", async () => {
  const previousToken = process.env.AGENT_BRIDGE_TOKEN;
  process.env.AGENT_BRIDGE_TOKEN = "test-only-bridge-token";
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  const broker = new AgentBridgeBroker(config, store, {
    claude: new MockAdapter("claude"),
    codex: new MockAdapter("codex")
  });
  await broker.initialize();
  const http = await startHttpServer(broker, config);
  const unauthenticated = new Client({ name: "unauthenticated", version: "1.0.0" });
  const authenticated = new Client({ name: "authenticated", version: "1.0.0" });

  try {
    await assert.rejects(
      () => unauthenticated.connect(new StreamableHTTPClientTransport(new URL(`${http.url}/mcp`))),
      /401|Unauthorized/i
    );
    await authenticated.connect(new StreamableHTTPClientTransport(
      new URL(`${http.url}/mcp`),
      { requestInit: { headers: { Authorization: "Bearer test-only-bridge-token" } } }
    ));
    assert.ok((await authenticated.listTools()).tools.length > 0);
  } finally {
    await unauthenticated.close().catch(() => undefined);
    await authenticated.close().catch(() => undefined);
    await http.close();
    if (previousToken === undefined) delete process.env.AGENT_BRIDGE_TOKEN;
    else process.env.AGENT_BRIDGE_TOKEN = previousToken;
  }
});
