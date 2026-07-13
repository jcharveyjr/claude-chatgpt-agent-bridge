import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "skills/delegate-to-peer");
const destinations = [
  resolve(root, ".claude/skills/delegate-to-peer"),
  resolve(root, ".codex/skills/delegate-to-peer"),
  resolve(root, "plugins/agent-bridge/skills/delegate-to-peer"),
  resolve(root, "plugins/claude-agent-bridge/skills/delegate-to-peer")
];

for (const destination of destinations) {
  await mkdir(dirname(destination), { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
}

process.stdout.write(`Synchronized delegation skill to ${destinations.length} destinations.\n`);
