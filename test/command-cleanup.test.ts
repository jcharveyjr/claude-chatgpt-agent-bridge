import assert from "node:assert/strict";
import { test } from "node:test";
import { runCommand, buildWindowsShellCommand } from "../src/adapters/command.js";

test("runCommand terminates a running worker promptly on cancellation", async () => {
  const controller = new AbortController();
  const started = Date.now();
  const pending = runCommand({
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    cwd: process.cwd(),
    signal: controller.signal,
    timeoutMs: 30_000,
    env: process.env
  });
  setTimeout(() => controller.abort(), 300);
  await assert.rejects(pending, /cancelled/);
  // If the worker were not actually killed, this would wait the full 30s timeout.
  assert.ok(Date.now() - started < 15_000, "cancel must not wait for the timeout");
});

test("runCommand does not crash when the worker exits before reading stdin", async () => {
  const controller = new AbortController();
  const result = await runCommand({
    command: process.execPath,
    args: ["-e", "process.exit(0)"],
    cwd: process.cwd(),
    input: "x".repeat(200_000),
    signal: controller.signal,
    timeoutMs: 10_000,
    env: process.env
  });
  assert.equal(result.exitCode, 0);
});

test("runCommand preserves large output up to the cap", async () => {
  const controller = new AbortController();
  const size = 100_000;
  const result = await runCommand({
    command: process.execPath,
    args: ["-e", `process.stdout.write('A'.repeat(${size}), () => process.exit(0))`],
    cwd: process.cwd(),
    signal: controller.signal,
    timeoutMs: 10_000,
    env: process.env
  });
  assert.equal(result.stdout.length, size);
});

test("buildWindowsShellCommand handles empty args, spaces, and backslashes", () => {
  assert.equal(buildWindowsShellCommand("codex.cmd", []), '"codex.cmd"');
  assert.equal(
    buildWindowsShellCommand("C:\\Program Files\\node\\claude.cmd", ["a b"]),
    '"C:\\Program Files\\node\\claude.cmd" "a b"'
  );
});
