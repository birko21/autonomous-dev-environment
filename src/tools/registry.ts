import type { RegisteredTool } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.descriptor.name)) throw new Error(`Tool already registered: ${tool.descriptor.name}`);
    this.tools.set(tool.descriptor.name, tool);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): RegisteredTool[] {
    return [...this.tools.values()];
  }
}
