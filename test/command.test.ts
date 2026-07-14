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

test("runCommand rejects with a clear timeout error when no marker appears", async () => {
  const controller = new AbortController();
  await assert.rejects(
    () => runCommand({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1_000);"],
      cwd: process.cwd(),
      signal: controller.signal,
      timeoutMs: 200,
      env: process.env
    }),
    /timed out after 200 ms/
  );
});

test("buildWindowsShellCommand quotes the executable and each argument", async () => {
  const { buildWindowsShellCommand } = await import("../src/adapters/command.js");
  assert.equal(
    buildWindowsShellCommand("C:\\tools\\claude.cmd", ["-p", "--max-turns", "30"]),
    '"C:\\tools\\claude.cmd" "-p" "--max-turns" "30"'
  );
  // Embedded double quotes are doubled so cmd.exe parses them literally.
  assert.equal(
    buildWindowsShellCommand("codex.cmd", ['say "hi"']),
    '"codex.cmd" "say ""hi"""'
  );
});
