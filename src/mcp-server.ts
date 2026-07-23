import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentBridgeBroker } from "./broker.js";
import { BRIDGE_VERSION } from "./instance.js";
import { AGENT_NAMES, SOURCE_AGENTS, TASK_MODES, TASK_STATUSES } from "./types.js";

const textResult = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent:
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : { data: value },
  isError
});

export function createMcpServer(broker: AgentBridgeBroker): McpServer {
  const server = new McpServer(
    { name: "agent-bridge", version: BRIDGE_VERSION },
    {
      instructions:
        "Delegate bounded work between Claude and Codex. Use capabilities first, submit with delegate_task, then poll get_task. Never create circular delegation; source_agent and target_agent must differ."
    }
  );

  server.registerTool(
    "agent_bridge_capabilities",
    {
      title: "Agent bridge capabilities",
      description: "Check configured agents, availability, workspaces, and delegation limits before assigning work.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => textResult(await broker.capabilities())
  );

  server.registerTool(
    "delegate_task",
    {
      title: "Delegate task to peer agent",
      description: "Queue a bounded asynchronous task for Claude or Codex. Returns a task ID immediately; use get_task for status and results.",
      inputSchema: {
        target_agent: z.enum(AGENT_NAMES),
        source_agent: z.enum(SOURCE_AGENTS),
        task: z.string().min(1),
        workspace: z.string().min(1).optional(),
        mode: z.enum(TASK_MODES).default("read_only"),
        context: z.string().optional(),
        success_criteria: z.array(z.string()).max(20).optional(),
        parent_task_id: z.string().uuid().optional(),
        metadata: z.record(z.string(), z.string()).optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
    },
    async (input) => {
      try {
        const task = await broker.delegate({
          targetAgent: input.target_agent,
          sourceAgent: input.source_agent,
          task: input.task,
          ...(input.workspace ? { workspace: input.workspace } : {}),
          mode: input.mode,
          ...(input.context ? { context: input.context } : {}),
          ...(input.success_criteria ? { successCriteria: input.success_criteria } : {}),
          ...(input.parent_task_id ? { parentTaskId: input.parent_task_id } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {})
        });
        return textResult({ id: task.id, status: task.status, targetAgent: task.targetAgent });
      } catch (error) {
        return textResult({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    }
  );

  server.registerTool(
    "get_task",
    {
      title: "Get delegated task",
      description: "Get current status and, when finished, the result or error for one delegated task.",
      inputSchema: { task_id: z.string().uuid() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ task_id }) => {
      const task = await broker.get(task_id);
      return task ? textResult(task) : textResult({ error: `Task '${task_id}' was not found` }, true);
    }
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List delegated tasks",
      description: "List recent delegated tasks, optionally filtered by status or target agent.",
      inputSchema: {
        status: z.enum(TASK_STATUSES).optional(),
        target_agent: z.enum(AGENT_NAMES).optional(),
        limit: z.number().int().min(1).max(200).default(50)
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async (input) => textResult(await broker.list({
      ...(input.status ? { status: input.status } : {}),
      ...(input.target_agent ? { targetAgent: input.target_agent } : {}),
      limit: input.limit
    }))
  );

  server.registerTool(
    "cancel_task",
    {
      title: "Cancel delegated task",
      description: "Cancel a queued or running delegated task. Completed tasks are returned unchanged.",
      inputSchema: { task_id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async ({ task_id }) => {
      try {
        return textResult(await broker.cancel(task_id));
      } catch (error) {
        return textResult({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    }
  );

  return server;
}
