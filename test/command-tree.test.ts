import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { runCommand } from "../src/adapters/command.js";

// Signal 0 probes for existence without delivering a signal. On Windows an
// existing-but-unsignalable process reports EPERM, which still means "alive".
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitDead(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await sleep(100);
  }
  return !isAlive(pid);
}

async function readPid(pidFile: string): Promise<number> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const value = Number.parseInt(await readFile(pidFile, "utf8"), 10);
      if (Number.isInteger(value) && value > 0) return value;
    } catch {
      // pid file not written yet
    }
    await sleep(100);
  }
  return 0;
}

// A "parent worker" that spawns a long-running grandchild, records the
// grandchild pid, then idles until it is terminated.
const parentScript = (pidFile: string): string => `
  const { spawn } = require("node:child_process");
  const { writeFileSync } = require("node:fs");
  const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid));
  console.log("READY " + grandchild.pid);
  setInterval(() => {}, 1000);
`;

async function runTreeTest(mode: "cancel" | "timeout"): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "agent-bridge-tree-"));
  const pidFile = join(dir, "grandchild.pid");
  const controller = new AbortController();
  const pending = runCommand({
    command: process.execPath,
    args: ["-e", parentScript(pidFile)],
    cwd: process.cwd(),
    signal: controller.signal,
    timeoutMs: mode === "timeout" ? 2_000 : 30_000,
    env: process.env
  });

  let grandchildPid = 0;
  try {
    grandchildPid = await readPid(pidFile);
    assert.ok(grandchildPid > 0, "grandchild pid should be captured");
    assert.ok(isAlive(grandchildPid), "grandchild should be alive before termination");

    if (mode === "cancel") controller.abort();
    await pending.catch(() => { /* expected: cancelled or timed out */ });

    assert.ok(
      await waitDead(grandchildPid, 10_000),
      `grandchild ${grandchildPid} must be terminated together with the process tree`
    );
  } finally {
    controller.abort();
    await pending.catch(() => {});
    if (grandchildPid > 0 && isAlive(grandchildPid)) {
      try { process.kill(grandchildPid, "SIGKILL"); } catch { /* already gone */ }
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test("runCommand terminates a spawned grandchild on cancellation", async () => {
  await runTreeTest("cancel");
});

test("runCommand terminates a spawned grandchild on timeout", async () => {
  await runTreeTest("timeout");
});