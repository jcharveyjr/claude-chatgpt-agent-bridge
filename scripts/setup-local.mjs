import { spawnSync } from "node:child_process";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const bridgeUrl = "http://127.0.0.1:8787/mcp";

function usage() {
  return `Agent Bridge local setup

Usage:
  node scripts/setup-local.mjs [options]

Options:
  --workspace-name <name>  Name for an allowed project workspace
  --workspace <path>       Project folder to allow (requires --workspace-name)
  --skip-register          Build without changing Claude or Codex MCP settings
  --skip-install           Reuse the existing node_modules directory
  --dry-run                Print the planned actions without changing anything
  --help                    Show this help

Without workspace options, the bridge repository itself is the only allowed workspace.
Existing bridge.config.json and existing MCP registrations are preserved.`;
}

function parseArguments(argv) {
  const options = {
    dryRun: false,
    skipInstall: false,
    skipRegister: false,
    workspaceName: undefined,
    workspacePath: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--skip-install") {
      options.skipInstall = true;
      continue;
    }
    if (argument === "--skip-register") {
      options.skipRegister = true;
      continue;
    }
    if (argument === "--workspace-name" || argument === "--workspace") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === "--workspace-name") {
        options.workspaceName = value;
      } else {
        options.workspacePath = resolve(value);
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (Boolean(options.workspaceName) !== Boolean(options.workspacePath)) {
    throw new Error("--workspace-name and --workspace must be provided together");
  }
  if (options.workspaceName && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.workspaceName)) {
    throw new Error("Workspace names may contain only letters, numbers, underscores, and hyphens");
  }

  return options;
}

function run(command, args, { allowFailure = false, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    const detail = result.error?.message ?? `${command} exited with status ${String(result.status)}`;
    throw new Error(detail);
  }
  return result;
}

function commandVersion(command) {
  const result = run(command, ["--version"], { allowFailure: true, capture: true });
  const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split(/\r?\n/)[0];
  return { ok: !result.error && result.status === 0, detail };
}

function printCheck(label, check) {
  process.stdout.write(`${check.ok ? "PASS" : "FAIL"}  ${label}${check.detail ? `: ${check.detail}` : ""}\n`);
}

async function configureWorkspace(options) {
  const configPath = resolve(projectRoot, "bridge.config.json");
  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
    process.stdout.write("KEEP  bridge.config.json already exists\n");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await copyFile(resolve(projectRoot, "bridge.config.example.json"), configPath);
      config = JSON.parse(await readFile(configPath, "utf8"));
      process.stdout.write("CREATE  bridge.config.json from the safe loopback example\n");
    } else {
      throw new Error(`bridge.config.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let changed = false;
  if (options.workspaceName && options.workspacePath) {
    config.workspaces ??= {};
    config.workspaces[options.workspaceName] = options.workspacePath;
    config.defaultWorkspace = options.workspaceName;
    changed = true;
    process.stdout.write(`SET   default workspace '${options.workspaceName}' -> ${options.workspacePath}\n`);
  }

  const nativeCodex = await findWindowsCodexNative();
  if (nativeCodex) {
    config.agents ??= {};
    config.agents.codex ??= {};
    if (config.agents.codex.command !== nativeCodex) {
      config.agents.codex.command = nativeCodex;
      changed = true;
      process.stdout.write(`SET   native Codex worker -> ${nativeCodex}\n`);
    }
  }

  if (changed) await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function findWindowsCodexNative() {
  if (process.platform !== "win32") return undefined;
  const npmRoot = run("npm", ["root", "-g"], { allowFailure: true, capture: true });
  if (npmRoot.error || npmRoot.status !== 0) return undefined;
  const root = `${npmRoot.stdout ?? ""}`.trim().split(/\r?\n/).at(-1);
  if (!root) return undefined;
  const candidate = resolve(
    root,
    "@openai",
    "codex",
    "node_modules",
    "@openai",
    "codex-win32-x64",
    "vendor",
    "x86_64-pc-windows-msvc",
    "bin",
    "codex.exe"
  );
  try {
    await access(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

function mcpIsRegistered(command) {
  const getResult = run(command, ["mcp", "get", "agent-bridge"], {
    allowFailure: true,
    capture: true
  });
  if (!getResult.error && getResult.status === 0) {
    return true;
  }
  const listResult = run(command, ["mcp", "list"], { allowFailure: true, capture: true });
  const output = `${listResult.stdout ?? ""}${listResult.stderr ?? ""}`;
  return !listResult.error && listResult.status === 0 && /\bagent-bridge\b/.test(output);
}

function registerMcp(command, addArguments) {
  if (mcpIsRegistered(command)) {
    process.stdout.write(`KEEP  ${command} already has an agent-bridge MCP entry\n`);
    return;
  }
  run(command, addArguments);
  if (!mcpIsRegistered(command)) {
    throw new Error(`${command} did not report agent-bridge after registration`);
  }
  process.stdout.write(`ADD   agent-bridge to ${command}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const plannedWorkspace = options.workspaceName
    ? `${options.workspaceName} -> ${options.workspacePath}`
    : `bridge -> ${projectRoot}`;

  if (options.dryRun) {
    process.stdout.write(`DRY RUN\nProject: ${projectRoot}\nWorkspace: ${plannedWorkspace}\n`);
    process.stdout.write(`Actions: check prerequisites, ${options.skipInstall ? "reuse" : "install"} dependencies, configure, build, test, ${options.skipRegister ? "skip" : "perform"} MCP registration, run doctor.\n`);
    return;
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const nodeCheck = { ok: nodeMajor >= 20, detail: process.version };
  const claudeCheck = commandVersion("claude");
  const codexCheck = commandVersion("codex");
  printCheck("Node.js >= 20", nodeCheck);
  printCheck("Claude Code CLI", claudeCheck);
  printCheck("Codex CLI", codexCheck);

  if (!nodeCheck.ok || !claudeCheck.ok || !codexCheck.ok) {
    process.stderr.write("\nInstall or sign in to the failed prerequisite, then run this command again.\n");
    process.stderr.write("Claude Code: https://code.claude.com/docs/en/overview\n");
    process.stderr.write("Codex CLI: https://learn.chatgpt.com/docs/codex/cli\n");
    process.exitCode = 1;
    return;
  }

  if (!options.skipInstall) {
    run("npm", ["install"]);
  }
  await configureWorkspace(options);
  run("npm", ["run", "sync:skills"]);
  run("npm", ["run", "typecheck"]);
  run("npm", ["test"]);
  run("npm", ["run", "build"]);
  run("npm", ["run", "smoke:http"]);

  if (!options.skipRegister) {
    registerMcp("claude", ["mcp", "add", "--transport", "http", "agent-bridge", bridgeUrl]);
    registerMcp("codex", ["mcp", "add", "agent-bridge", "--url", bridgeUrl]);
  }

  run("npm", ["run", "doctor"]);
  process.stdout.write("\nREADY  Start the shared bridge with: npm run start:http\n");
  process.stdout.write("Then open http://127.0.0.1:8787/health and confirm status is ok.\n");
}

main().catch((error) => {
  process.stderr.write(`SETUP FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
