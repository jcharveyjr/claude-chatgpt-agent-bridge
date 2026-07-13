import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { MockAdapter } from "../src/adapters/mock.js";
import { AgentBridgeBroker } from "../src/broker.js";
import { TaskStore } from "../src/store.js";
import { testConfig } from "./helpers.js";

test("broker delegates to a peer and records its result", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  const broker = new AgentBridgeBroker(config, store, {
    claude: new MockAdapter("claude"),
    codex: new MockAdapter("codex", async (request) => ({
      output: `Reviewed from ${request.workspacePath}`,
      metadata: { checks: 3 }
    }))
  });
  await broker.initialize();

  const queued = await broker.delegate({
    targetAgent: "codex",
    sourceAgent: "claude",
    task: "Review the implementation",
    successCriteria: ["Report concrete findings"]
  });
  await broker.waitForIdle();
  const completed = await broker.get(queued.id);

  assert.equal(completed?.status, "completed");
  assert.match(completed?.result ?? "", /Reviewed from/);
  assert.equal(completed?.metadata["worker.checks"], "3");
});

test("broker rejects same-agent and excessive-depth delegation", async () => {
  const config = await testConfig({ maxDelegationDepth: 0 });
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  const broker = new AgentBridgeBroker(config, store, {
    claude: new MockAdapter("claude"),
    codex: new MockAdapter("codex")
  });
  await broker.initialize();

  await assert.rejects(() => broker.delegate({
    targetAgent: "claude",
    sourceAgent: "claude",
    task: "Loop"
  }), /must differ/);

  const parent = await broker.delegate({
    targetAgent: "codex",
    sourceAgent: "claude",
    task: "Parent"
  });
  await assert.rejects(() => broker.delegate({
    targetAgent: "claude",
    sourceAgent: "codex",
    task: "Child",
    parentTaskId: parent.id
  }), /exceeds maximum/);
  await broker.waitForIdle();
});

test("broker cancellation aborts a running task", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  const broker = new AgentBridgeBroker(config, store, {
    claude: new MockAdapter("claude", (request) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ output: "too late" }), 10_000);
      request.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      }, { once: true });
    })),
    codex: new MockAdapter("codex")
  });
  await broker.initialize();
  const delegated = await broker.delegate({
    targetAgent: "claude",
    sourceAgent: "codex",
    task: "Long task"
  });

  while ((await broker.get(delegated.id))?.status === "queued") {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await broker.cancel(delegated.id);
  await broker.waitForIdle();
  assert.equal((await broker.get(delegated.id))?.status, "cancelled");
});
