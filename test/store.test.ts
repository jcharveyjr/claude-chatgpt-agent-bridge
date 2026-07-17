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

test("TaskStore.prune removes old and excess terminal tasks but keeps active ones", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  await store.initialize();

  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-07-17T00:00:00.000Z");
  const at = (offsetDays: number) => new Date(now.getTime() - offsetDays * day).toISOString();

  // Two active tasks that must always survive.
  await store.create({ ...task("queued-1"), status: "queued", createdAt: at(400) });
  await store.create({ ...task("running-1"), status: "running", createdAt: at(400) });
  // Old completed task (older than the age window).
  await store.create({ ...task("old-done"), status: "completed", createdAt: at(120), completedAt: at(120) });
  // Recent terminal tasks.
  await store.create({ ...task("recent-done"), status: "completed", createdAt: at(1), completedAt: at(1) });
  await store.create({ ...task("recent-failed"), status: "failed", createdAt: at(2), completedAt: at(2) });

  const byAge = await store.prune({ maxAgeDays: 90, now });
  assert.equal(byAge.removed, 1); // only old-done
  assert.ok(await store.get("queued-1"));
  assert.ok(await store.get("running-1"));
  assert.equal(await store.get("old-done"), undefined);

  // Cap total to 3: 2 active are protected, so only 1 terminal slot remains.
  const byCount = await store.prune({ maxTasks: 3, now });
  assert.equal(byCount.removed, 1); // drops the older of the two remaining terminal tasks
  assert.ok(await store.get("recent-done")); // newest terminal survives
  assert.equal(await store.get("recent-failed"), undefined);
  assert.ok(await store.get("queued-1"));
  assert.ok(await store.get("running-1"));
});

test("TaskStore.stats aggregates counts by status and agent", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  await store.initialize();
  await store.create({ ...task("a"), status: "completed" });
  await store.create({ ...task("b"), status: "failed", targetAgent: "codex" });
  await store.create({ ...task("c"), status: "queued" });

  const stats = await store.stats();
  assert.equal(stats.total, 3);
  assert.equal(stats.byStatus.completed, 1);
  assert.equal(stats.byStatus.failed, 1);
  assert.equal(stats.byStatus.queued, 1);
  assert.equal(stats.byTargetAgent.codex, 1);
  assert.equal(stats.byTargetAgent.claude, 2);
});
