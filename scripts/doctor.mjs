import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const checks = [];

const checkCommand = (name, args = ["--version"]) => {
  // Avoid Node DEP0190 (args array + shell:true). On Windows, compose one
  // command string so .cmd launchers still resolve without a separate args array.
  const result = process.platform === "win32"
    ? spawnSync([name, ...args].join(" "), { encoding: "utf8", shell: true, windowsHide: true })
    : spawnSync(name, args, { encoding: "utf8", windowsHide: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split(/\r?\n/)[0];
  checks.push({ name, ok: result.status === 0, detail: output || "not found or not authenticated" });
};

checks.push({
  name: "Node.js >= 20",
  ok: Number(process.versions.node.split(".")[0]) >= 20,
  detail: process.version
});
checkCommand("claude");
checkCommand("codex");

const configPath = resolve(process.env.AGENT_BRIDGE_CONFIG ?? "bridge.config.json");
try {
  await access(configPath, constants.R_OK);
  JSON.parse(await readFile(configPath, "utf8"));
  checks.push({ name: "bridge.config.json", ok: true, detail: configPath });
} catch (error) {
  checks.push({
    name: "bridge.config.json",
    ok: false,
    detail: error instanceof Error ? error.message : String(error)
  });
}

try {
  await access(resolve("dist/src/cli.js"), constants.R_OK);
  checks.push({ name: "compiled server", ok: true, detail: resolve("dist/src/cli.js") });
} catch {
  checks.push({ name: "compiled server", ok: false, detail: "run npm run build" });
}

for (const check of checks) {
  process.stdout.write(`${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}\n`);
}

process.exitCode = checks.every((check) => check.ok) ? 0 : 1;
