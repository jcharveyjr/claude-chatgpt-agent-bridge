import { createHash } from "node:crypto";

export const BRIDGE_VERSION = "0.1.11";

export interface InstanceMetadata {
  instanceId: string;
  pid: number;
  version: string;
  configFingerprint: string;
  dataDirFingerprint: string;
  startedAt: string;
}

/**
 * Non-reversible, stable identifier for a filesystem path. Exposed over /health
 * in place of the absolute path so the health endpoint never discloses where the
 * install lives, while still letting `status` detect that the reachable broker is
 * a different installation than the local config/data directory.
 */
export function fingerprintPath(path: string): string {
  const normalized = process.platform === "win32" ? path.toLowerCase() : path;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}