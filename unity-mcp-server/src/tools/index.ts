import { GetEditorStateTool } from './GetEditorStateTool.js';
import { ExecuteEditorCommandTool } from './ExecuteEditorCommandTool.js';
import { GetLogsTool } from './GetLogsTool.js';
import { LogEntry, Tool, UnityEditorState, ToolContext } from './types.js';
import { UnityConnection, CommandResultHandler } from '../communication/UnityConnection.js';

export * from './types.js';

export function getAllTools(): Tool[] {
  return [
    new GetEditorStateTool(),
    new ExecuteEditorCommandTool(),
    new GetLogsTool()
  ];
}
