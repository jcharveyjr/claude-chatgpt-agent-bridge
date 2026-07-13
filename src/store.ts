import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentName, BridgeTask, TaskStatus } from "./types.js";

interface StoreData {
  schemaVersion: 1;
  tasks: BridgeTask[];
}

const EMPTY_STORE: StoreData = { schemaVersion: 1, tasks: [] };

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
