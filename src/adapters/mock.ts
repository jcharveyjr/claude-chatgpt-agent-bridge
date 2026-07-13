import type { AgentAdapter, AgentName, AgentRunRequest, AgentRunResult } from "../types.js";

export class MockAdapter implements AgentAdapter {
  public readonly kind = "mock";

  public constructor(
    public readonly name: AgentName,
    private readonly handler: (request: AgentRunRequest) => Promise<AgentRunResult> = async (request) => ({
      output: `Mock ${request.task.targetAgent} completed: ${request.task.task}`
    })
  ) {}

  public async isAvailable(): Promise<{ available: boolean; detail: string }> {
    return { available: true, detail: "in-process test adapter" };
  }

  public run(request: AgentRunRequest): Promise<AgentRunResult> {
    return this.handler(request);
  }
}
