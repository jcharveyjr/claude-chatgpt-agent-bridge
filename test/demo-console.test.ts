import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { MockAdapter } from "../src/adapters/mock.js";
import { AgentBridgeBroker } from "../src/broker.js";
import type { BridgeConfig } from "../src/config.js";
import { TaskStore } from "../src/store.js";
import { startHttpServer } from "../src/transports/http.js";
import type { BridgeTask } from "../src/types.js";
import { testConfig } from "./helpers.js";

async function testBridge(overrides: Partial<BridgeConfig> = {}) {
  const config = await testConfig(overrides);
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  const broker = new AgentBridgeBroker(config, store, {
    claude: new MockAdapter("claude"),
    codex: new MockAdapter("codex")
  });
  await broker.initialize();
  const http = await startHttpServer(broker, config);
  return { broker, http };
}

async function waitForTask(url: string, id: string): Promise<BridgeTask> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${url}/console/api/tasks/${id}`);
    assert.equal(response.status, 200);
    const body = await response.json() as { task: BridgeTask };
    if (["completed", "failed", "cancelled"].includes(body.task.status)) return body.task;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Task did not settle");
}

test("demo console serves its UI and completes a delegated task", async () => {
  const { http } = await testBridge();
  try {
    const page = await fetch(`${http.url}/console/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    assert.match(await page.text(), /Agent Bridge Demo Console/);

    const capabilities = await fetch(`${http.url}/console/api/capabilities`, {
      headers: { Origin: http.url }
    });
    assert.equal(capabilities.status, 200);
    const capabilityBody = await capabilities.json() as {
      capabilities: { workspaces: string[]; agents: Record<string, unknown> };
    };
    assert.deepEqual(capabilityBody.capabilities.workspaces, ["test"]);
    assert.ok(capabilityBody.capabilities.agents.claude);

    const createdResponse = await fetch(`${http.url}/console/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: http.url },
      body: JSON.stringify({
        sourceAgent: "claude",
        targetAgent: "codex",
        workspace: "test",
        mode: "read_only",
        task: "Return the demo result.",
        successCriteria: ["Return a concise response"]
      })
    });
    assert.equal(createdResponse.status, 202);
    const created = await createdResponse.json() as { task: BridgeTask };
    assert.equal(created.task.metadata.client, "demo-console");

    const completed = await waitForTask(http.url, created.task.id);
    assert.equal(completed.status, "completed");
    assert.match(completed.result ?? "", /Mock codex completed/);

    const listResponse = await fetch(`${http.url}/console/api/tasks?limit=10`);
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json() as { tasks: BridgeTask[] };
    assert.ok(listed.tasks.some((task) => task.id === completed.id));
  } finally {
    await http.close();
  }
});

test("demo console validates origins, payloads, and unknown tasks", async () => {
  const { http } = await testBridge();
  try {
    const forbidden = await fetch(`${http.url}/console/api/capabilities`, {
      headers: { Origin: "https://evil.example" }
    });
    assert.equal(forbidden.status, 403);

    const invalid = await fetch(`${http.url}/console/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceAgent: "claude",
        targetAgent: "claude",
        task: "This must be rejected."
      })
    });
    assert.equal(invalid.status, 400);
    assert.match(JSON.stringify(await invalid.json()), /must differ/);

    const missing = await fetch(`${http.url}/console/api/tasks/00000000-0000-0000-0000-000000000000`);
    assert.equal(missing.status, 404);
  } finally {
    await http.close();
  }
});

test("demo console API honors the bridge bearer token", async () => {
  const previousToken = process.env.AGENT_BRIDGE_TOKEN;
  process.env.AGENT_BRIDGE_TOKEN = "console-test-token";
  const { http } = await testBridge();
  try {
    const page = await fetch(`${http.url}/console/`);
    assert.equal(page.status, 200);

    const unauthorized = await fetch(`${http.url}/console/api/capabilities`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${http.url}/console/api/capabilities`, {
      headers: { authorization: "Bearer console-test-token" }
    });
    assert.equal(authorized.status, 200);
  } finally {
    await http.close();
    if (previousToken === undefined) delete process.env.AGENT_BRIDGE_TOKEN;
    else process.env.AGENT_BRIDGE_TOKEN = previousToken;
  }
});

test("demo console is not served from a non-loopback bridge", async () => {
  const previousToken = process.env.AGENT_BRIDGE_TOKEN;
  process.env.AGENT_BRIDGE_TOKEN = "non-loopback-test-token";
  const { http } = await testBridge({
    http: {
      host: "0.0.0.0",
      port: 0,
      allowedOrigins: []
    }
  });
  try {
    const localUrl = http.url.replace("0.0.0.0", "127.0.0.1");
    const page = await fetch(`${localUrl}/console/`);
    assert.equal(page.status, 404);
    assert.match(await page.text(), /loopback-bound bridge/);
  } finally {
    await http.close();
    if (previousToken === undefined) delete process.env.AGENT_BRIDGE_TOKEN;
    else process.env.AGENT_BRIDGE_TOKEN = previousToken;
  }
});
