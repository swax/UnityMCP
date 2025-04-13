import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { Tool, ToolContext, ToolDefinition } from "./types.js";

export interface UnityEditorState {
  activeGameObjects: string[];
  selectedObjects: string[];
  playModeState: string;
  sceneHierarchy: any;
  projectStructure: {
    scenes?: string[];
    assets?: string[];
    [key: string]: string[] | undefined;
  };
}

export interface UnityEditorStateHandler {
  resolve: (value: UnityEditorState) => void;
  reject: (reason?: any) => void;
}

// Command state management
let unityEditorStatePromise: UnityEditorStateHandler | null = null;
let unityEditorStateTime: number | null = null;

// New method to resolve the command result - called when results arrive from Unity
export function resolveUnityEditorState(result: UnityEditorState): void {
  if (unityEditorStatePromise) {
    unityEditorStatePromise.resolve(result);
    unityEditorStatePromise = null;
  }
}

export class GetEditorStateTool implements Tool {
  getDefinition(): ToolDefinition {
    return {
      name: "get_editor_state",
      description:
        "Retrieve the current state of the Unity Editor, including active GameObjects, selection state, play mode status, scene hierarchy, project structure, and assets in the Assets/Game/ folder. This tool provides a comprehensive snapshot of the editor's current context.",
      category: "Editor State",
      tags: ["unity", "editor", "state", "hierarchy", "project"],
      inputSchema: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["Raw", "scripts only", "no scripts"],
            description:
              "Specify the output format:\n- Raw: Complete editor state including all available data\n- scripts only: Returns only the list of script files in the project\n- no scripts: Returns everything except script-related information",
            default: "Raw",
          },
        },
        additionalProperties: false,
      },
      returns: {
        type: "object",
        description:
          "Returns a JSON object containing the requested editor state information",
        format:
          "The response format varies based on the format parameter:\n- Raw: Full UnityEditorState object\n- scripts only: Array of script file paths\n- no scripts: UnityEditorState minus script-related fields",
      },
      examples: [
        {
          description: "Get complete editor state",
          input: {},
          output:
            '{ "activeGameObjects": ["Main Camera", "Directional Light"], ... }',
        },
        {
          description: "Get only script files",
          input: { format: "scripts only" },
          output: '["Assets/Scripts/Player.cs", "Assets/Scripts/Enemy.cs"]',
        },
      ],
    };
  }

  async execute(args: any, context: ToolContext) {
    const validFormats = ["Raw", "scripts only", "no scripts"];
    const format = (args?.format as string) || "Raw";

    if (args?.format && !validFormats.includes(format)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid format: "${format}". Valid formats are: ${validFormats.join(
          ", ",
        )}`,
      );
    }

    try {
      // Clear previous logs and set command start time
      const startLogIndex = context.logBuffer.length;
      unityEditorStateTime = Date.now();

      // Send command to Unity to get editor state
      context.unityConnection!.sendMessage("getEditorState", {});

      // Wait for result with timeout handling
      const timeoutMs = 30_000;
      const editorState = await Promise.race([
        new Promise<UnityEditorState>((resolve, reject) => {
          unityEditorStatePromise = { resolve, reject };
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Getting editor state timed out after ${
                    timeoutMs / 1000
                  } seconds. This may indicate an issue with the Unity Editor.`,
                ),
              ),
            timeoutMs,
          ),
        ),
      ]);

      // Get logs that occurred during command execution
      const commandLogs = context.logBuffer
        .slice(startLogIndex)
        .filter((log) => log.message.includes("[UnityMCP]"));

      // Calculate execution time
      const executionTime = Date.now() - (unityEditorStateTime || 0);

      // Process the response based on format
      let responseData: any;
      switch (format) {
        case "Raw":
          responseData = editorState;
          break;
        case "scripts only":
          responseData = editorState.projectStructure.scripts || [];
          break;
        case "no scripts": {
          const { projectStructure, ...stateWithoutScripts } = {
            ...editorState,
          };
          const { scripts, ...otherStructure } = { ...projectStructure };
          responseData = {
            ...stateWithoutScripts,
            projectStructure: otherStructure,
            logs: commandLogs,
            executionTime: `${executionTime}ms`,
            status: "success",
          };
          break;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(responseData, null, 2),
          },
        ],
      };
    } catch (error) {
      // Enhanced error handling
      if (error instanceof Error && error.message.includes("timed out")) {
        throw new McpError(ErrorCode.InternalError, error.message);
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to process editor state: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }
}
