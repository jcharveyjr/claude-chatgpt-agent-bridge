import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { TaskStore } from "../src/store.js";
import { collectStatus, formatStatus } from "../src/status.js";
import type { BridgeTask } from "../src/types.js";
import { testConfig } from "./helpers.js";

function task(id: string, over: Partial<BridgeTask>): BridgeTask {
  const now = new Date().toISOString();
  return {
    id,
    targetAgent: "claude",
    sourceAgent: "codex",
    task: "inspect",
    workspace: "test",
    mode: "read_only",
    successCriteria: [],
    delegationDepth: 0,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    metadata: {},
    ...over
  };
}

test("collectStatus reports queue counts, workers, retention, and health", async () => {
  const config = await testConfig();
  const store = new TaskStore(join(config.dataDirectory, "tasks.json"));
  await store.initialize();
  await store.create(task("q", { status: "queued" }));
  await store.create(task("r", { status: "running", startedAt: new Date().toISOString() }));
  await store.create(task("f", { status: "failed", error: "boom", completedAt: new Date().toISOString() }));

  const report = await collectStatus(config);
  assert.equal(report.queue.queued, 1);
  assert.equal(report.queue.running, 1);
  assert.equal(report.queue.failed, 1);
  assert.equal(report.running.length, 1);
  assert.equal(report.running[0]?.id, "r");
  assert.equal(report.recentFailures[0]?.id, "f");
  // Nothing is listening on the test port, so health is unreachable.
  assert.equal(report.broker.healthy, false);
  // Mock adapters report available.
  assert.equal(report.workers.claude?.available, true);
  assert.equal(report.retention.maxCompletedTasks, 500);
  assert.match(formatStatus(report), /Agent Bridge status/);
});
