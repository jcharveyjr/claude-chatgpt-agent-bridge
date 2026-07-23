import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectTaskStore } from "../src/store.js";
import { collectStatus } from "../src/status.js";
import { testConfig } from "./helpers.js";

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agent-bridge-store-"));
}

test("inspectTaskStore reports healthy for a valid store", async () => {
  const dir = await tmp();
  const path = join(dir, "tasks.json");
  try {
    await writeFile(path, JSON.stringify({ schemaVersion: 1, tasks: [] }));
    const result = await inspectTaskStore(path);
    assert.equal(result.state, "healthy");
    assert.equal(result.reliable, true);
    assert.deepEqual(result.tasks, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspectTaskStore reports missing when the file does not exist", async () => {
  const dir = await tmp();
  try {
    const result = await inspectTaskStore(join(dir, "tasks.json"));
    assert.equal(result.state, "missing");
    assert.equal(result.reliable, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspectTaskStore reports corrupt for invalid JSON", async () => {
  const dir = await tmp();
  const path = join(dir, "tasks.json");
  try {
    await writeFile(path, "{ not valid json ");
    const result = await inspectTaskStore(path);
    assert.equal(result.state, "corrupt");
    assert.equal(result.reliable, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspectTaskStore reports unsupported-schema for a wrong schemaVersion", async () => {
  const dir = await tmp();
  const path = join(dir, "tasks.json");
  try {
    await writeFile(path, JSON.stringify({ schemaVersion: 2, tasks: [] }));
    const result = await inspectTaskStore(path);
    assert.equal(result.state, "unsupported-schema");
    assert.equal(result.reliable, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspectTaskStore reports corrupt when tasks is not an array", async () => {
  const dir = await tmp();
  const path = join(dir, "tasks.json");
  try {
    await writeFile(path, JSON.stringify({ schemaVersion: 1, tasks: "nope" }));
    const result = await inspectTaskStore(path);
    assert.equal(result.state, "corrupt");
    assert.equal(result.reliable, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspectTaskStore reports unreadable when the path is a directory", async () => {
  const dir = await tmp();
  const path = join(dir, "store-as-dir");
  try {
    await mkdir(path);
    const result = await inspectTaskStore(path);
    assert.equal(result.state, "unreadable");
    assert.equal(result.reliable, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("collectStatus surfaces a corrupt store instead of a healthy empty queue", async () => {
  const config = await testConfig();
  await mkdir(config.dataDirectory, { recursive: true });
  await writeFile(join(config.dataDirectory, "tasks.json"), "{ broken");
  const report = await collectStatus(config);
  assert.equal(report.taskStore.state, "corrupt");
  assert.equal(report.queueReliable, false);
  assert.equal(report.queue.completed, 0);
});