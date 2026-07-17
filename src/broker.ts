import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import type { BridgeConfig } from "./config.js";
import { buildDelegationPrompt } from "./prompt.js";
import { BRIDGE_VERSION, fingerprintPath, type InstanceMetadata } from "./instance.js";
import { TaskStore } from "./store.js";
import type {
  AgentAdapter,
  AgentName,
  BridgeTask,
  DelegatedTaskInput,
  TaskStatus
} from "./types.js";

export class AgentBridgeBroker {
  private readonly active = new Map<AgentName, Promise<void>>();
  private readonly abortControllers = new Map<string, AbortController>();
  public readonly instanceId = randomUUID();
  public readonly startedAt = new Date().toISOString();

  public constructor(
    private readonly config: BridgeConfig,
    private readonly store: TaskStore,
    private readonly adapters: Record<AgentName, AgentAdapter>
  ) {}

  public async initialize(): Promise<void> {
    await this.store.initialize();
    await this.store.recoverInterrupted();
    await this.store.enforceRetention(this.config.retention);
    this.schedule("claude");
    this.schedule("codex");
  }

  public async capabilities(): Promise<Record<string, unknown>> {
    const agents = await Promise.all(
      (Object.keys(this.adapters) as AgentName[]).map(async (name) => {
        const availability = await this.adapters[name].isAvailable();
        return [name, {
          adapter: this.adapters[name].kind,
          enabled: this.config.agents[name].enabled,
          ...availability
        }] as const;
      })
    );
    return {
      protocol: "MCP",
      version: "0.1.0",
      agents: Object.fromEntries(agents),
      workspaces: Object.keys(this.config.workspaces),
      defaultWorkspace: this.config.defaultWorkspace,
      maxDelegationDepth: this.config.maxDelegationDepth,
      supportedModes: ["read_only", "workspace_write"],
      execution: "asynchronous; call get_task to retrieve the result"
    };
  }

  public instanceMetadata(): InstanceMetadata {
    return {
      instanceId: this.instanceId,
      pid: process.pid,
      version: BRIDGE_VERSION,
      configFingerprint: fingerprintPath(this.config.configPath),
      dataDirFingerprint: fingerprintPath(this.config.dataDirectory),
      startedAt: this.startedAt
    };
  }
  public async delegate(input: DelegatedTaskInput): Promise<BridgeTask> {
    const normalizedTask = input.task.trim();
    if (!normalizedTask) throw new Error("task must not be empty");
    if (normalizedTask.length > this.config.maxTaskCharacters) {
      throw new Error(`task exceeds ${this.config.maxTaskCharacters} characters`);
    }
    const contextSize = input.context?.length ?? 0;
    const criteriaSize = input.successCriteria?.reduce((total, value) => total + value.length, 0) ?? 0;
    if (normalizedTask.length + contextSize + criteriaSize > this.config.maxTaskCharacters) {
      throw new Error(`combined task, context, and success criteria exceed ${this.config.maxTaskCharacters} characters`);
    }
    if (input.sourceAgent === input.targetAgent) {
      throw new Error("sourceAgent and targetAgent must differ for cross-vendor delegation");
    }
    const availability = await this.adapters[input.targetAgent].isAvailable();
    if (!availability.installed) {
      throw new Error(`${input.targetAgent} worker command not found: ${availability.detail}`);
    }

    const workspace = input.workspace ?? this.config.defaultWorkspace;
    const workspacePath = this.config.workspaces[workspace];
    if (!workspacePath) {
      throw new Error(`Unknown workspace '${workspace}'. Allowed: ${Object.keys(this.config.workspaces).join(", ")}`);
    }
    await access(
      workspacePath,
      input.mode === "workspace_write" ? constants.R_OK | constants.W_OK : constants.R_OK
    );

    let delegationDepth = 0;
    if (input.parentTaskId) {
      const parent = await this.store.get(input.parentTaskId);
      if (!parent) throw new Error(`Parent task '${input.parentTaskId}' was not found`);
      delegationDepth = parent.delegationDepth + 1;
    }
    if (delegationDepth > this.config.maxDelegationDepth) {
      throw new Error(`Delegation depth ${delegationDepth} exceeds maximum ${this.config.maxDelegationDepth}`);
    }

    const now = new Date().toISOString();
    const task: BridgeTask = {
      id: randomUUID(),
      targetAgent: input.targetAgent,
      sourceAgent: input.sourceAgent,
      task: normalizedTask,
      workspace,
      mode: input.mode ?? "read_only",
      ...(input.context?.trim() ? { context: input.context.trim() } : {}),
      successCriteria: input.successCriteria?.map((value) => value.trim()).filter(Boolean) ?? [],
      ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
      delegationDepth,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata ?? {}
    };
    const created = await this.store.create(task);
    this.schedule(task.targetAgent);
    return created;
  }

  public get(id: string): Promise<BridgeTask | undefined> {
    return this.store.get(id);
  }

  public list(options: { status?: TaskStatus; targetAgent?: AgentName; limit?: number }): Promise<BridgeTask[]> {
    return this.store.list(options);
  }

  public async cancel(id: string): Promise<BridgeTask> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Task '${id}' was not found`);
    if (["completed", "failed", "cancelled"].includes(existing.status)) return existing;
    this.abortControllers.get(id)?.abort();
    const cancelled = await this.store.update(id, (task) => {
      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
      task.error = "Cancelled by request.";
    });
    if (!cancelled) throw new Error(`Task '${id}' disappeared during cancellation`);
    return cancelled;
  }

  public async waitForIdle(): Promise<void> {
    await Promise.all(this.active.values());
  }

  private schedule(agent: AgentName): void {
    if (this.active.has(agent)) return;
    const run = this.runQueue(agent).finally(() => {
      this.active.delete(agent);
    });
    this.active.set(agent, run);
  }

  private async runQueue(agent: AgentName): Promise<void> {
    while (true) {
      const queued = (await this.store.list({ status: "queued", targetAgent: agent, limit: 200 }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!queued) return;
      await this.execute(queued);
    }
  }

  private async execute(queued: BridgeTask): Promise<void> {
    const controller = new AbortController();
    this.abortControllers.set(queued.id, controller);
    const started = await this.store.update(queued.id, (task) => {
      if (task.status !== "queued") return;
      task.status = "running";
      task.startedAt = new Date().toISOString();
      delete task.error;
    });
    if (!started || started.status !== "running") return;

    try {
      const result = await this.adapters[started.targetAgent].run({
        task: started,
        workspacePath: this.config.workspaces[started.workspace]!,
        prompt: buildDelegationPrompt(started),
        signal: controller.signal
      });
      await this.store.update(started.id, (task) => {
        if (task.status === "cancelled") return;
        task.status = "completed";
        task.completedAt = new Date().toISOString();
        task.result = result.output;
        if (result.metadata) {
          for (const [key, value] of Object.entries(result.metadata)) {
            task.metadata[`worker.${key}`] = String(value);
          }
        }
      });
    } catch (error) {
      await this.store.update(started.id, (task) => {
        if (task.status === "cancelled") return;
        task.status = "failed";
        task.completedAt = new Date().toISOString();
        task.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      this.abortControllers.delete(started.id);
      await this.store.enforceRetention(this.config.retention);
    }
  }
}
