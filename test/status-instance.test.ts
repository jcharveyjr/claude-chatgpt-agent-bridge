import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { AgentBridgeBroker } from "../src/broker.js";
import { TaskStore } from "../src/store.js";
import { buildAdapters } from "../src/adapters/index.js";
import { startHttpServer } from "../src/transports/http.js";
import { collectStatus, classifyInstanceMatch } from "../src/status.js";
import type { InstanceMetadata } from "../src/instance.js";
import { testConfig } from "./helpers.js";

function meta(over: Partial<InstanceMetadata> = {}): InstanceMetadata {
  return {
    instanceId: "id",
    pid: 123,
    version: "0.1.7",
    configFingerprint: "cfg",
    dataDirFingerprint: "data",
    startedAt: new Date().toISOString(),
    ...over
  };
}

test("classifyInstanceMatch returns match when both fingerprints agree", () => {
  assert.equal(
    classifyInstanceMatch({ configFingerprint: "cfg", dataDirFingerprint: "data" }, meta()),
    "match"
  );
});

test("classifyInstanceMatch returns mismatch when the data-dir fingerprint differs", () => {
  assert.equal(
    classifyInstanceMatch({ configFingerprint: "cfg", dataDirFingerprint: "OTHER" }, meta()),
    "mismatch"
  );
});

test("classifyInstanceMatch returns mismatch when the config fingerprint differs", () => {
  assert.equal(
    classifyInstanceMatch({ configFingerprint: "OTHER", dataDirFingerprint: "data" }, meta()),
    "mismatch"
  );
});

test("classifyInstanceMatch returns unknown when the broker reports no metadata", () => {
  assert.equal(
    classifyInstanceMatch({ configFingerprint: "cfg", dataDirFingerprint: "data" }, undefined),
    "unknown"
  );
});

test("collectStatus reports a matching instance against a live broker", async () => {
  const config = await testConfig();
  const broker = new AgentBridgeBroker(
    config,
    new TaskStore(join(config.dataDirectory, "tasks.json")),
    buildAdapters(config)
  );
  const http = await startHttpServer(broker, config);
  try {
    const port = Number(new URL(http.url).port);
    const report = await collectStatus({ ...config, http: { ...config.http, port } });
    assert.equal(report.broker.healthy, true);
    assert.equal(report.instance.match, "match");
    assert.equal(report.instance.brokerReported?.pid, process.pid);
  } finally {
    await http.close();
  }
});

test("collectStatus flags a mismatch when local data dir differs from the live broker", async () => {
  const config = await testConfig();
  const broker = new AgentBridgeBroker(
    config,
    new TaskStore(join(config.dataDirectory, "tasks.json")),
    buildAdapters(config)
  );
  const http = await startHttpServer(broker, config);
  try {
    const port = Number(new URL(http.url).port);
    const report = await collectStatus({
      ...config,
      dataDirectory: `${config.dataDirectory}-different`,
      http: { ...config.http, port }
    });
    assert.equal(report.broker.healthy, true);
    assert.equal(report.instance.match, "mismatch");
  } finally {
    await http.close();
  }
});

test("collectStatus reports unknown instance when the broker is unreachable", async () => {
  const config = await testConfig();
  const report = await collectStatus(config);
  assert.equal(report.broker.healthy, false);
  assert.equal(report.instance.match, "unknown");
});

test("collectStatus reports pid undefined when no pid file exists", async () => {
  const config = await testConfig();
  const report = await collectStatus(config);
  assert.equal(report.pid, undefined);
});

test("collectStatus marks a stale pid as not running", async () => {
  const config = await testConfig();
  await mkdir(config.dataDirectory, { recursive: true });
  await writeFile(join(config.dataDirectory, "bridge.pid"), "999999999");
  const report = await collectStatus(config);
  assert.equal(report.pid, 999999999);
  assert.equal(report.pidRunning, false);
});