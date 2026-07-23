import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { AgentBridgeBroker } from "../src/broker.js";
import { BRIDGE_VERSION } from "../src/instance.js";
import { MockAdapter } from "../src/adapters/mock.js";
import { TaskStore } from "../src/store.js";
import { testConfig } from "./helpers.js";

test("runtime version metadata matches package metadata", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  ) as { version: string };

  assert.equal(BRIDGE_VERSION, packageJson.version);

  const config = await testConfig();
  const broker = new AgentBridgeBroker(
    config,
    new TaskStore(join(config.dataDirectory, "tasks.json")),
    { claude: new MockAdapter("claude"), codex: new MockAdapter("codex") }
  );
  assert.equal((await broker.capabilities()).version, packageJson.version);
  assert.equal(broker.instanceMetadata().version, packageJson.version);
});
