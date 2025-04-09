import { ExecuteEditorCommandTool } from "./ExecuteEditorCommandTool.js";
import { GetEditorStateTool } from "./GetEditorStateTool.js";
import { GetLogsTool } from "./GetLogsTool.js";
import { Tool } from "./types.js";

export * from "./types.js";

export function getAllTools(): Tool[] {
  return [
    new GetEditorStateTool(),
    new ExecuteEditorCommandTool(),
    new GetLogsTool(),
  ];
}
