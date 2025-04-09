import {
  CommandResultHandler,
  UnityConnection,
} from "../communication/UnityConnection.js";

export interface UnityEditorState {
  activeGameObjects: string[];
  selectedObjects: string[];
  playModeState: string;
  sceneHierarchy: any;
  projectStructure: {
    scenes?: string[];
    prefabs?: string[];
    scripts?: string[];
    [key: string]: string[] | undefined;
  };
}

export interface LogEntry {
  message: string;
  stackTrace: string;
  logType: string;
  timestamp: string;
}

export interface CommandResult {
  result: any;
  logs: string[];
  errors: string[];
  warnings: string[];
  executionSuccess: boolean;
  errorDetails?: {
    message: string;
    stackTrace: string;
    type: string;
  };
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
  editorState: UnityEditorState;
  logBuffer: LogEntry[];
  commandResultPromise: CommandResultHandler | null;
  commandStartTime: number | null;
  setCommandResultPromise: (promise: CommandResultHandler) => void;
  setCommandStartTime: (time: number) => void;
}

export interface Tool {
  getDefinition(): ToolDefinition;
  execute(args: any, context: ToolContext): Promise<any>;
}
