import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AGENT_NAMES, TASK_STATUSES } from "./types.js";
import type { AgentName, BridgeTask, TaskStatus } from "./types.js";

interface StoreData {
  schemaVersion: 1;
  tasks: BridgeTask[];
}

const EMPTY_STORE: StoreData = { schemaVersion: 1, tasks: [] };

/** Statuses that represent finished work and are therefore eligible for pruning. */
const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "completed",
  "failed",
  "cancelled"
]);

export interface RetentionOptions {
  /** Maximum number of tasks to retain in total. Non-terminal tasks are never removed. */
  maxTasks?: number;
  /** Terminal tasks older than this many days are removed. */
  maxAgeDays?: number;
  /** Injectable clock for deterministic testing. */
  now?: Date;
}

export interface PruneResult {
  removed: number;
  remaining: number;
}

export interface StoreStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byTargetAgent: Record<AgentName, number>;
  oldestCreatedAt?: string;
  newestCreatedAt?: string;
}

export class TaskStore {
  private operation = Promise.resolve();

  public constructor(private readonly path: string) {}

  public async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.write(EMPTY_STORE);
    }
  }

  public async create(task: BridgeTask): Promise<BridgeTask> {
    return this.serial(async () => {
      const data = await this.read();
      data.tasks.push(task);
      await this.write(data);
      return structuredClone(task);
    });
  }

  public async get(id: string): Promise<BridgeTask | undefined> {
    return this.serial(async () => {
      const data = await this.read();
      const task = data.tasks.find((candidate) => candidate.id === id);
      return task ? structuredClone(task) : undefined;
    });
  }

  public async list(options: {
    status?: TaskStatus;
    targetAgent?: AgentName;
    limit?: number;
  } = {}): Promise<BridgeTask[]> {
    return this.serial(async () => {
      const data = await this.read();
      const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
      return data.tasks
        .filter((task) => !options.status || task.status === options.status)
        .filter((task) => !options.targetAgent || task.targetAgent === options.targetAgent)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((task) => structuredClone(task));
    });
  }

  public async update(
    id: string,
    mutate: (task: BridgeTask) => void
  ): Promise<BridgeTask | undefined> {
    return this.serial(async () => {
      const data = await this.read();
      const task = data.tasks.find((candidate) => candidate.id === id);
      if (!task) return undefined;
      mutate(task);
      task.updatedAt = new Date().toISOString();
      await this.write(data);
      return structuredClone(task);
    });
  }

  public async recoverInterrupted(): Promise<number> {
    return this.serial(async () => {
      const data = await this.read();
      let recovered = 0;
      for (const task of data.tasks) {
        if (task.status === "running") {
          task.status = "queued";
          task.error = "Recovered after the bridge stopped during execution.";
          task.updatedAt = new Date().toISOString();
          delete task.startedAt;
          recovered += 1;
        }
      }
      if (recovered > 0) await this.write(data);
      return recovered;
    });
  }

  /**
   * Remove finished (completed/failed/cancelled) tasks to keep the store bounded.
   * Queued and running tasks are always retained. Terminal tasks are removed when
   * they are older than `maxAgeDays`, and the newest terminal tasks are kept up to
   * the remaining `maxTasks` budget after accounting for active tasks.
   */
  public async prune(options: RetentionOptions = {}): Promise<PruneResult> {
    return this.serial(async () => {
      const data = await this.read();
      const before = data.tasks.length;

      const active = data.tasks.filter((task) => !TERMINAL_STATUSES.has(task.status));
      let terminal = data.tasks.filter((task) => TERMINAL_STATUSES.has(task.status));

      const maxAgeDays = options.maxAgeDays;
      if (typeof maxAgeDays === "number" && maxAgeDays >= 0) {
        const now = (options.now ?? new Date()).getTime();
        const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
        terminal = terminal.filter((task) => {
          const stamp = Date.parse(task.completedAt ?? task.updatedAt ?? task.createdAt);
          return Number.isNaN(stamp) ? true : stamp >= cutoff;
        });
      }

      const maxTasks = options.maxTasks;
      if (typeof maxTasks === "number" && maxTasks >= 0) {
        const terminalBudget = Math.max(0, maxTasks - active.length);
        if (terminal.length > terminalBudget) {
          terminal = [...terminal]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, terminalBudget);
        }
      }

      const kept = new Set([...active, ...terminal]);
      if (kept.size !== before) {
        data.tasks = data.tasks.filter((task) => kept.has(task));
        await this.write(data);
      }
      return { removed: before - data.tasks.length, remaining: data.tasks.length };
    });
  }

  /** Aggregate counts for status reporting without exposing task contents. */
  public async stats(): Promise<StoreStats> {
    return this.serial(async () => {
      const data = await this.read();
      const byStatus = Object.fromEntries(
        TASK_STATUSES.map((status) => [status, 0])
      ) as Record<TaskStatus, number>;
      const byTargetAgent = Object.fromEntries(
        AGENT_NAMES.map((agent) => [agent, 0])
      ) as Record<AgentName, number>;
      let oldest: string | undefined;
      let newest: string | undefined;
      for (const task of data.tasks) {
        byStatus[task.status] += 1;
        byTargetAgent[task.targetAgent] += 1;
        if (!oldest || task.createdAt < oldest) oldest = task.createdAt;
        if (!newest || task.createdAt > newest) newest = task.createdAt;
      }
      return {
        total: data.tasks.length,
        byStatus,
        byTargetAgent,
        ...(oldest ? { oldestCreatedAt: oldest } : {}),
        ...(newest ? { newestCreatedAt: newest } : {})
      };
    });
  }

  private async read(): Promise<StoreData> {
    const raw = await readFile(this.path, "utf8");
    const data = JSON.parse(raw) as StoreData;
    if (data.schemaVersion !== 1 || !Array.isArray(data.tasks)) {
      throw new Error(`Unsupported or corrupt task store at ${this.path}`);
    }
    return data;
  }

  private async write(data: StoreData): Promise<void> {
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.path);
  }

  private async serial<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operation;
    let release!: () => void;
    this.operation = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
