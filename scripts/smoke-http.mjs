import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 39_000 + Math.floor(Math.random() * 10_000);
const child = spawn(process.execPath, ["dist/src/cli.js", "http"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    AGENT_BRIDGE_HOST: "127.0.0.1",
    AGENT_BRIDGE_PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

const timeout = setTimeout(() => {
  child.kill();
}, 10_000);

try {
  while (!output.includes("Agent bridge listening")) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with status ${String(child.exitCode)}: ${output.trim()}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }

  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await response.json();
  if (!response.ok || body?.ok !== true || body?.service !== "agent-bridge") {
    throw new Error(`unexpected health response: ${response.status} ${JSON.stringify(body)}`);
  }
  process.stdout.write(`PASS  release server health check on loopback port ${port}\n`);
} finally {
  clearTimeout(timeout);
  child.kill();
  await new Promise((resolveExit) => {
    if (child.exitCode !== null) {
      resolveExit();
      return;
    }
    child.once("exit", resolveExit);
  });
}
