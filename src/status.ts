import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BridgeConfig } from "./config.js";
import { buildAdapters } from "./adapters/index.js";
import { fingerprintPath, type InstanceMetadata } from "./instance.js";
import { inspectTaskStore, type TaskStoreState } from "./store.js";
import type { TaskStatus } from "./types.js";

export type InstanceMatch = "match" | "mismatch" | "unknown";

export interface StatusReport {
  broker: { endpoint: string; healthy: boolean; detail: string };
  instance: {
    match: InstanceMatch;
    local: { configFingerprint: string; dataDirFingerprint: string };
    brokerReported?: InstanceMetadata;
  };
  pid: number | undefined;
  pidRunning: boolean | undefined;
  workers: Record<string, { available: boolean; detail: string }>;
  queue: Record<TaskStatus, number>;
  queueReliable: boolean;
  taskStore: { state: TaskStoreState; reliable: boolean; detail: string };
  running: Array<{ id: string; targetAgent: string; startedAt?: string }>;
  recentFailures: Array<{ id: string; error: string; completedAt?: string }>;
  dataDirectory: string;
  retention: BridgeConfig["retention"];
}

interface HealthResult {
  healthy: boolean;
  detail: string;
  instance?: InstanceMetadata;
}

/**
 * Compare the fingerprints reported by the reachable broker against the ones
 * computed from the local config/data directory. "unknown" means we could not
 * read broker metadata (unreachable, or an older broker without it).
 */
export function classifyInstanceMatch(
  local: { configFingerprint: string; dataDirFingerprint: string },
  reported: InstanceMetadata | undefined
): InstanceMatch {
  if (!reported) return "unknown";
  const sameConfig = reported.configFingerprint === local.configFingerprint;
  const sameData = reported.dataDirFingerprint === local.dataDirFingerprint;
  return sameConfig && sameData ? "match" : "mismatch";
}

async function checkHealth(endpoint: string): Promise<HealthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${endpoint}/health`, { signal: controller.signal });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; instance?: InstanceMetadata };
    if (response.ok && body?.ok === true) {
      return { healthy: true, detail: "ok", ...(body.instance ? { instance: body.instance } : {}) };
    }
    return { healthy: false, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { healthy: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function readPid(dataDirectory: string): Promise<number | undefined> {
  try {
    const raw = await readFile(join(dataDirectory, "bridge.pid"), "utf8");
    const pid = Number(raw.trim());
    return Number.isInteger(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

function isPidRunning(pid: number | undefined): boolean | undefined {
  if (pid === undefined) return undefined;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function collectStatus(config: BridgeConfig): Promise<StatusReport> {
  const endpoint = `http://${config.http.host}:${config.http.port}`;
  const health = await checkHealth(endpoint);
  const localFingerprints = {
    configFingerprint: fingerprintPath(config.configPath),
    dataDirFingerprint: fingerprintPath(config.dataDirectory)
  };
  const adapters = buildAdapters(config);
  const workerEntries = await Promise.all(
    (Object.keys(adapters) as Array<keyof typeof adapters>).map(async (name) => {
      const availability = await adapters[name].isAvailable();
      return [name, availability] as const;
    })
  );
  const storeInspection = await inspectTaskStore(join(config.dataDirectory, "tasks.json"));
  const tasks = storeInspection.tasks;
  const queue: Record<TaskStatus, number> = {
    queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0
  };
  for (const task of tasks) {
    if (task.status in queue) queue[task.status] += 1;
  }
  const running = tasks
    .filter((task) => task.status === "running")
    .map((task) => ({
      id: task.id,
      targetAgent: task.targetAgent,
      ...(task.startedAt ? { startedAt: task.startedAt } : {})
    }));
  const recentFailures = tasks
    .filter((task) => task.status === "failed")
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
    .slice(0, 5)
    .map((task) => ({
      id: task.id,
      error: (task.error ?? "").slice(0, 200),
      ...(task.completedAt ? { completedAt: task.completedAt } : {})
    }));
  const pid = await readPid(config.dataDirectory);
  return {
    broker: { endpoint: `${endpoint}/mcp`, healthy: health.healthy, detail: health.detail },
    instance: {
      match: classifyInstanceMatch(localFingerprints, health.instance),
      local: localFingerprints,
      ...(health.instance ? { brokerReported: health.instance } : {})
    },
    pid,
    pidRunning: isPidRunning(pid),
    workers: Object.fromEntries(workerEntries),
    queue,
    queueReliable: storeInspection.reliable,
    taskStore: { state: storeInspection.state, reliable: storeInspection.reliable, detail: storeInspection.detail },
    running,
    recentFailures,
    dataDirectory: config.dataDirectory,
    retention: config.retention
  };
}

export function formatStatus(report: StatusReport): string {
  const lines: string[] = ["Agent Bridge status"];
  lines.push(`  Endpoint:   ${report.broker.endpoint}`);
  lines.push(`  Health:     ${report.broker.healthy ? "healthy" : `unreachable (${report.broker.detail})`}`);
  if (report.instance.match === "mismatch") {
    lines.push("  Instance:   MISMATCH - reachable broker is a different install than this config/data dir");
  } else if (report.instance.match === "match") {
    const reported = report.instance.brokerReported;
    lines.push(`  Instance:   match (broker pid ${reported?.pid ?? "?"}, up since ${reported?.startedAt ?? "?"})`);
  } else {
    lines.push("  Instance:   unknown (broker unreachable or no instance metadata)");
  }
  const pidText = report.pid === undefined
    ? "unknown"
    : `${report.pid} (${report.pidRunning ? "running" : "not running"})`;
  lines.push(`  PID:        ${pidText}`);
  lines.push(`  Data dir:   ${report.dataDirectory}`);
  lines.push(`  Task store: ${report.taskStore.state}${report.taskStore.reliable ? "" : ` (${report.taskStore.detail})`}`);
  lines.push("  Workers:");
  for (const [name, worker] of Object.entries(report.workers)) {
    lines.push(`    ${name}: ${worker.available ? "available" : "unavailable"} - ${worker.detail}`);
  }
  lines.push(
    `  Queue:      queued=${report.queue.queued} running=${report.queue.running} ` +
    `completed=${report.queue.completed} failed=${report.queue.failed} cancelled=${report.queue.cancelled}` +
    `${report.queueReliable ? "" : "  (UNRELIABLE: task store not readable)"}`
  );
  if (report.running.length > 0) {
    lines.push("  Running:");
    for (const item of report.running) {
      lines.push(`    ${item.id} -> ${item.targetAgent}${item.startedAt ? ` (since ${item.startedAt})` : ""}`);
    }
  }
  if (report.recentFailures.length > 0) {
    lines.push("  Recent failures:");
    for (const failure of report.recentFailures) {
      lines.push(`    ${failure.id}: ${failure.error}`);
    }
  }
  lines.push(
    `  Retention:  maxCompletedTasks=${report.retention.maxCompletedTasks} ` +
    `maxTaskAgeDays=${report.retention.maxTaskAgeDays} ` +
    `maxLogSizeBytes=${report.retention.maxLogSizeBytes} maxLogFiles=${report.retention.maxLogFiles}`
  );
  return lines.join("\n");
}