import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeCliAdapter } from "../src/adapters/claude-cli.js";
import { MockAdapter } from "../src/adapters/mock.js";
import type { AgentConfig } from "../src/config.js";

function claudeConfig(over: Partial<AgentConfig> = {}): AgentConfig {
  return { adapter: "claude-cli", command: "claude", enabled: true, timeoutMs: 1_000, maxTurns: 3, ...over };
}

test("mock adapter reports installed with unknown readiness and no provider check", async () => {
  const result = await new MockAdapter("claude").isAvailable();
  assert.equal(result.installed, true);
  assert.equal(result.commandFound, true);
  assert.equal(result.readiness, "unknown");
  assert.equal(result.providerCheck, "not performed");
});

test("cli adapter reports not installed when the command is missing", async () => {
  const adapter = new ClaudeCliAdapter(claudeConfig({ command: "agent-bridge-no-such-cmd-xyz" }));
  const result = await adapter.isAvailable();
  assert.equal(result.installed, false);
  assert.equal(result.commandFound, false);
  assert.equal(result.readiness, "unknown");
  assert.equal(result.providerCheck, "not performed");
});

test("cli adapter reports installed but never infers readiness from an existing executable", async () => {
  // process.execPath is a real, executable absolute path; findCommand resolves it.
  const adapter = new ClaudeCliAdapter(claudeConfig({ command: process.execPath }));
  const result = await adapter.isAvailable();
  assert.equal(result.installed, true);
  assert.equal(result.commandFound, true);
  assert.equal(result.executablePath, process.execPath);
  // Crucial: the presence of the executable must NOT be read as readiness.
  assert.equal(result.readiness, "unknown");
  assert.equal(result.providerCheck, "not performed");
});

test("cli adapter reports not installed when disabled in configuration", async () => {
  const adapter = new ClaudeCliAdapter(claudeConfig({ enabled: false }));
  const result = await adapter.isAvailable();
  assert.equal(result.installed, false);
  assert.equal(result.detail, "disabled in configuration");
});