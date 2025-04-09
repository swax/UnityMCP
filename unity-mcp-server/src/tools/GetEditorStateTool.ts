import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { Tool, ToolContext, ToolDefinition } from "./types.js";

export class GetEditorStateTool implements Tool {
  getDefinition(): ToolDefinition {
    return {
      name: "get_editor_state",
      description:
        "Retrieve the current state of the Unity Editor, including active GameObjects, selection state, play mode status, scene hierarchy, and project structure. This tool provides a comprehensive snapshot of the editor's current context.",
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

    let responseData: any;

    try {
      switch (format) {
        case "Raw":
          responseData = context.editorState;
          break;
        case "scripts only":
          responseData = context.editorState.projectStructure.scripts || [];
          break;
        case "no scripts": {
          const { projectStructure, ...stateWithoutScripts } = {
            ...context.editorState,
          };
          const { scripts, ...otherStructure } = { ...projectStructure };
          responseData = {
            ...stateWithoutScripts,
            projectStructure: otherStructure,
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
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to process editor state: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }
}
