import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentName, BridgeTask, TaskStatus } from "./types.js";

interface StoreData {
  schemaVersion: 1;
  tasks: BridgeTask[];
}

const EMPTY_STORE: StoreData = { schemaVersion: 1, tasks: [] };

export interface RetentionPolicy {
  maxCompletedTasks: number;
  maxTaskAgeDays: number;
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
   * Prune terminal (completed/failed/cancelled) tasks so the store cannot grow
   * without bound. Queued and running tasks are always kept. Returns the number
   * of tasks removed.
   */
  public async enforceRetention(policy: RetentionPolicy): Promise<number> {
    return this.serial(async () => {
      const data = await this.read();
      const before = data.tasks.length;
      const isTerminal = (task: BridgeTask): boolean =>
        task.status === "completed" || task.status === "failed" || task.status === "cancelled";
      const terminalTime = (task: BridgeTask): string =>
        task.completedAt ?? task.updatedAt ?? task.createdAt;
      let tasks = data.tasks;
      if (policy.maxTaskAgeDays > 0) {
        const cutoff = Date.now() - policy.maxTaskAgeDays * 86_400_000;
        tasks = tasks.filter((task) => {
          if (!isTerminal(task)) return true;
          const ts = Date.parse(terminalTime(task));
          return Number.isFinite(ts) ? ts >= cutoff : true;
        });
      }
      if (policy.maxCompletedTasks > 0) {
        const terminal = tasks
          .filter(isTerminal)
          .sort((a, b) => terminalTime(b).localeCompare(terminalTime(a)));
        if (terminal.length > policy.maxCompletedTasks) {
          const keep = new Set(terminal.slice(0, policy.maxCompletedTasks).map((task) => task.id));
          tasks = tasks.filter((task) => !isTerminal(task) || keep.has(task.id));
        }
      }
      if (tasks.length !== before) {
        data.tasks = tasks;
        await this.write(data);
      }
      return before - tasks.length;
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

export type TaskStoreState =
  | "healthy"
  | "missing"
  | "unreadable"
  | "corrupt"
  | "unsupported-schema";

export interface TaskStoreInspection {
  state: TaskStoreState;
  reliable: boolean;
  detail: string;
  tasks: BridgeTask[];
}

/**
 * Read-only inspection of a task-store file that classifies its health instead
 * of collapsing every failure into an empty list. Reuses the same schema check
 * as TaskStore.read (schemaVersion === 1 and tasks is an array) so status and
 * the broker never disagree about what "valid" means.
 */
export async function inspectTaskStore(path: string): Promise<TaskStoreInspection> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { state: "missing", reliable: false, detail: "no task store on disk yet", tasks: [] };
    }
    return {
      state: "unreadable",
      reliable: false,
      detail: `cannot read task store (${code ?? "unknown error"})`,
      tasks: []
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: "corrupt", reliable: false, detail: "task store is not valid JSON", tasks: [] };
  }
  const candidate = parsed as { schemaVersion?: unknown; tasks?: unknown };
  if (candidate.schemaVersion !== 1) {
    return {
      state: "unsupported-schema",
      reliable: false,
      detail: `unsupported task-store schemaVersion: ${String(candidate.schemaVersion)}`,
      tasks: []
    };
  }
  if (!Array.isArray(candidate.tasks)) {
    return { state: "corrupt", reliable: false, detail: "task store 'tasks' field is not an array", tasks: [] };
  }
  return { state: "healthy", reliable: true, detail: "ok", tasks: candidate.tasks as BridgeTask[] };
}
