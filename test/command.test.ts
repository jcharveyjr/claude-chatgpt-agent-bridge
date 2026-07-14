import assert from "node:assert/strict";
import { test } from "node:test";
import { runCommand } from "../src/adapters/command.js";

test("runCommand treats a completion marker as a successful terminal event", async () => {
  const controller = new AbortController();
  const result = await runCommand({
    command: process.execPath,
    args: [
      "-e",
      "process.stdout.write('ready\\nCOMPLETE\\n'); setInterval(() => {}, 1_000);"
    ],
    cwd: process.cwd(),
    signal: controller.signal,
    timeoutMs: 5_000,
    env: process.env,
    completionMarker: "COMPLETE"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /ready/);
  assert.match(result.stdout, /COMPLETE/);
});
