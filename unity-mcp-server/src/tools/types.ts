import { UnityConnection } from "../communication/UnityConnection.js";

export interface LogEntry {
  message: string;
  stackTrace: string;
  logType: string;
  timestamp: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  tags: string[];
  inputSchema: object;
  returns: object;
  examples: {
    description: string;
    input: any;
    output: string;
  }[];
  errorHandling?: {
    description: string;
    scenarios: {
      error: string;
      handling: string;
    }[];
  };
}

export interface ToolContext {
  unityConnection: UnityConnection;
  logBuffer: LogEntry[];
}

export interface Tool {
  getDefinition(): ToolDefinition;
  execute(args: any, context: ToolContext): Promise<any>;
}
