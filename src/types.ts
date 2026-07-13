export const AGENT_NAMES = ["claude", "codex"] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const SOURCE_AGENTS = ["claude", "codex", "chatgpt", "human", "unknown"] as const;
export type SourceAgent = (typeof SOURCE_AGENTS)[number];

export const TASK_MODES = ["read_only", "workspace_write"] as const;
export type TaskMode = (typeof TASK_MODES)[number];

export const TASK_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled"
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface DelegatedTaskInput {
  targetAgent: AgentName;
  sourceAgent: SourceAgent;
  task: string;
  workspace?: string;
  mode?: TaskMode;
  context?: string;
  successCriteria?: string[];
  parentTaskId?: string;
  metadata?: Record<string, string>;
}

export interface BridgeTask {
  id: string;
  targetAgent: AgentName;
  sourceAgent: SourceAgent;
  task: string;
  workspace: string;
  mode: TaskMode;
  context?: string;
  successCriteria: string[];
  parentTaskId?: string;
  delegationDepth: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
  metadata: Record<string, string>;
}

export interface AgentRunRequest {
  task: BridgeTask;
  workspacePath: string;
  prompt: string;
  signal: AbortSignal;
}

export interface AgentRunResult {
  output: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AgentAdapter {
  readonly name: AgentName;
  readonly kind: string;
  isAvailable(): Promise<{ available: boolean; detail: string }>;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}
