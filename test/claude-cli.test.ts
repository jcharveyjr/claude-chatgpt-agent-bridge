import assert from "node:assert/strict";
import test from "node:test";

import { claudeFailureDetail } from "../src/adapters/claude-cli.js";

test("claudeFailureDetail reads JSON provider errors from stdout", () => {
  const stdout = JSON.stringify({ is_error: true, result: "Monthly spend limit reached" });
  assert.equal(claudeFailureDetail(stdout, ""), "Monthly spend limit reached");
});

test("claudeFailureDetail falls back to stderr and then raw stdout", () => {
  assert.equal(claudeFailureDetail("", "plain stderr"), "plain stderr");
  assert.equal(claudeFailureDetail("plain stdout", ""), "plain stdout");
  assert.equal(claudeFailureDetail("", ""), "no error detail returned");
});
