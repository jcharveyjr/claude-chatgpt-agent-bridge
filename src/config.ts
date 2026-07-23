import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentName } from "./types.js";

export interface AgentConfig {
  adapter: "claude-cli" | "codex-cli" | "mock";
  command: string;
  enabled: boolean;
  timeoutMs: number;
  maxTurns?: number;
  model?: string;
}

export interface BridgeConfig {
  configPath: string;
  projectRoot: string;
  dataDirectory: string;
  defaultWorkspace: string;
  maxDelegationDepth: number;
  maxTaskCharacters: number;
  retention: {
    maxCompletedTasks: number;
    maxTaskAgeDays: number;
    maxLogSizeBytes: number;
    maxLogFiles: number;
  };
  workspaces: Record<string, string>;
  agents: Record<AgentName, AgentConfig>;
  http: {
    host: string;
    port: number;
    allowedOrigins: string[];
    publicUrl?: string;
    oauth?: {
      issuer: string;
      audience: string;
      jwksUrl: string;
      requiredScopes: string[];
    };
  };
}

interface RawBridgeConfig {
  dataDirectory?: string;
  defaultWorkspace?: string;
  maxDelegationDepth?: number;
  maxTaskCharacters?: number;
  retention?: Partial<BridgeConfig["retention"]>;
  workspaces?: Record<string, string>;
  agents?: Partial<Record<AgentName, Partial<AgentConfig>>>;
  http?: Partial<BridgeConfig["http"]>;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const fallbackProjectRoot = resolve(moduleDirectory, "..");

const defaultAgents: Record<AgentName, AgentConfig> = {
  claude: {
    adapter: "claude-cli",
    command: "claude",
    enabled: true,
    timeoutMs: 1_800_000,
    maxTurns: 30
  },
  codex: {
    adapter: "codex-cli",
    command: "codex",
    enabled: true,
    timeoutMs: 1_800_000
  }
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(explicitPath?: string): Promise<BridgeConfig> {
  const requestedPath = explicitPath ?? process.env.AGENT_BRIDGE_CONFIG ?? "bridge.config.json";
  const absolutePath = resolve(requestedPath);
  const hasConfig = await fileExists(absolutePath);
  const raw: RawBridgeConfig = hasConfig
    ? (JSON.parse(await readFile(absolutePath, "utf8")) as RawBridgeConfig)
    : {};
  const projectRoot = hasConfig ? dirname(absolutePath) : fallbackProjectRoot;

  const rawWorkspaces = raw.workspaces ?? { bridge: "." };
  const workspaces = Object.fromEntries(
    Object.entries(rawWorkspaces).map(([name, path]) => [
      name,
      isAbsolute(path) ? resolve(path) : resolve(projectRoot, path)
    ])
  );

  const defaultWorkspace = raw.defaultWorkspace ?? Object.keys(workspaces)[0] ?? "bridge";
  if (!(defaultWorkspace in workspaces)) {
    throw new Error(`defaultWorkspace '${defaultWorkspace}' is not present in workspaces`);
  }

  const agents = Object.fromEntries(
    (Object.keys(defaultAgents) as AgentName[]).map((name) => [
      name,
      { ...defaultAgents[name], ...(raw.agents?.[name] ?? {}) }
    ])
  ) as Record<AgentName, AgentConfig>;

  const host = process.env.AGENT_BRIDGE_HOST ?? raw.http?.host ?? "127.0.0.1";
  const port = Number(process.env.AGENT_BRIDGE_PORT ?? raw.http?.port ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid HTTP port: ${String(port)}`);
  }

  const allowedOrigins = process.env.AGENT_BRIDGE_ALLOWED_ORIGINS
    ? process.env.AGENT_BRIDGE_ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean)
    : (raw.http?.allowedOrigins ?? ["https://chatgpt.com", "https://claude.ai"]);

  const oauthIssuer = process.env.AGENT_BRIDGE_OAUTH_ISSUER ?? raw.http?.oauth?.issuer;
  const oauthAudience = process.env.AGENT_BRIDGE_OAUTH_AUDIENCE ?? raw.http?.oauth?.audience;
  const oauthJwksUrl = process.env.AGENT_BRIDGE_OAUTH_JWKS_URL ?? raw.http?.oauth?.jwksUrl;
  const oauthRequiredScopes = process.env.AGENT_BRIDGE_OAUTH_SCOPES
    ? process.env.AGENT_BRIDGE_OAUTH_SCOPES.split(",").map((value) => value.trim()).filter(Boolean)
    : (raw.http?.oauth?.requiredScopes ?? ["agent_bridge:delegate"]);
  const oauthParts = [oauthIssuer, oauthAudience, oauthJwksUrl].filter(Boolean);
  if (oauthParts.length !== 0 && oauthParts.length !== 3) {
    throw new Error("OAuth mode requires issuer, audience, and jwksUrl");
  }
  const publicUrl = process.env.AGENT_BRIDGE_PUBLIC_URL ?? raw.http?.publicUrl;

  return {
    configPath: absolutePath,
    projectRoot,
    dataDirectory: resolve(projectRoot, raw.dataDirectory ?? ".agent-bridge"),
    defaultWorkspace,
    maxDelegationDepth: raw.maxDelegationDepth ?? 2,
    maxTaskCharacters: raw.maxTaskCharacters ?? 50_000,
    retention: {
      maxCompletedTasks: raw.retention?.maxCompletedTasks ?? 500,
      maxTaskAgeDays: raw.retention?.maxTaskAgeDays ?? 30,
      maxLogSizeBytes: raw.retention?.maxLogSizeBytes ?? 5_000_000,
      maxLogFiles: raw.retention?.maxLogFiles ?? 5
    },
    workspaces,
    agents,
    http: {
      host,
      port,
      allowedOrigins,
      ...(publicUrl ? { publicUrl: publicUrl.replace(/\/$/, "") } : {}),
      ...(oauthIssuer && oauthAudience && oauthJwksUrl ? {
        oauth: {
          issuer: oauthIssuer,
          audience: oauthAudience,
          jwksUrl: oauthJwksUrl,
          requiredScopes: oauthRequiredScopes
        }
      } : {})
    }
  };
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}
