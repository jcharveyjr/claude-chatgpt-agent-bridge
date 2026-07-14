import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
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

test("enforceRetention prunes terminal tasks beyond the count cap, keeping non-terminal", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  await store.initialize();
  for (let i = 0; i < 5; i += 1) {
    await store.create({
      ...task(`c${i}`),
      status: "completed",
      completedAt: new Date(2026, 0, 1, 0, 0, i).toISOString()
    });
  }
  await store.create(task("queued"));
  const removed = await store.enforceRetention({ maxCompletedTasks: 2, maxTaskAgeDays: 0 });
  assert.equal(removed, 3);
  const remaining = (await store.list({ limit: 200 })).map((item) => item.id).sort();
  assert.deepEqual(remaining, ["c3", "c4", "queued"]);
});

test("enforceRetention prunes terminal tasks older than the age cap", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  await store.initialize();
  await store.create({
    ...task("old"),
    status: "completed",
    completedAt: new Date(Date.now() - 40 * 86_400_000).toISOString()
  });
  await store.create({ ...task("recent"), status: "completed", completedAt: new Date().toISOString() });
  await store.create(task("queued"));
  const removed = await store.enforceRetention({ maxCompletedTasks: 0, maxTaskAgeDays: 30 });
  assert.equal(removed, 1);
  const ids = (await store.list({ limit: 200 })).map((item) => item.id).sort();
  assert.deepEqual(ids, ["queued", "recent"]);
});

test("TaskStore rejects a store file with an unsupported schema", async () => {
  const config = await testConfig();
  const path = join(config.dataDirectory, "tasks.json");
  const store = new TaskStore(path);
  await store.initialize();
  await writeFile(path, JSON.stringify({ schemaVersion: 2, tasks: [] }), "utf8");
  await assert.rejects(() => store.list(), /Unsupported or corrupt/);
});

test("TaskStore rejects an unparseable store file", async () => {
  const config = await testConfig();
  const path = join(config.dataDirectory, "tasks.json");
  const store = new TaskStore(path);
  await store.initialize();
  await writeFile(path, "{ not valid json", "utf8");
  await assert.rejects(() => store.list());
});
