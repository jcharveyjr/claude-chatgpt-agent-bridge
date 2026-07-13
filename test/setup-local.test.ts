import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("local setup command", () => {
  it("prints help without making changes", () => {
    const result = spawnSync(process.execPath, ["scripts/setup-local.mjs", "--help"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Agent Bridge local setup/);
    assert.match(result.stdout, /--workspace-name/);
  });

  it("supports a no-change dry run", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/setup-local.mjs",
        "--dry-run",
        "--skip-register",
        "--workspace-name",
        "sample",
        "--workspace",
        "."
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /DRY RUN/);
    assert.match(result.stdout, /sample ->/);
    assert.match(result.stdout, /skip MCP registration/);
  });

  it("rejects incomplete workspace options", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/setup-local.mjs", "--dry-run", "--workspace-name", "sample"],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be provided together/);
  });
});
