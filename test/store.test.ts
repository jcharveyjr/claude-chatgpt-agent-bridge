import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { TaskStore } from "../src/store.js";
import type { BridgeTask } from "../src/types.js";
import { testConfig } from "./helpers.js";

function task(id: string): BridgeTask {
  const now = new Date().toISOString();
  return {
    id,
    targetAgent: "claude",
    sourceAgent: "codex",
    task: "Inspect the test fixture",
    workspace: "test",
    mode: "read_only",
    successCriteria: [],
    delegationDepth: 0,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    metadata: {}
  };
}

test("TaskStore persists, filters, and updates tasks", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  await store.initialize();
  await store.create(task("first"));
  await store.create({ ...task("second"), targetAgent: "codex" });

  assert.equal((await store.list()).length, 2);
  assert.deepEqual((await store.list({ targetAgent: "codex" })).map((item) => item.id), ["second"]);
  const updated = await store.update("first", (item) => {
    item.status = "running";
  });
  assert.equal(updated?.status, "running");
  assert.equal((await store.get("first"))?.status, "running");
});

test("TaskStore requeues interrupted running tasks", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  await store.initialize();
  await store.create({ ...task("running"), status: "running", startedAt: new Date().toISOString() });

  assert.equal(await store.recoverInterrupted(), 1);
  const recovered = await store.get("running");
  assert.equal(recovered?.status, "queued");
  assert.match(recovered?.error ?? "", /Recovered/);
});
