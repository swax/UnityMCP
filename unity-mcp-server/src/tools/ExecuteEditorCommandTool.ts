import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Tool, ToolDefinition, ToolContext } from './types.js';

export class ExecuteEditorCommandTool implements Tool {
  getDefinition(): ToolDefinition {
    return {
      name: 'execute_editor_command',
      description: 'Execute arbitrary C# code file within the Unity Editor context. This powerful tool allows for direct manipulation of the Unity Editor, GameObjects, components, and project assets using the Unity Editor API.',
      category: 'Editor Control',
      tags: ['unity', 'editor', 'command', 'c#', 'scripting'],
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 
`C# code file to execute in the Unity Editor context. 
The code has access to all UnityEditor and UnityEngine APIs. 
Include any necessary using directives at the top of the code.
The code must have a EditorCommand class with a static Execute method that returns an object.`,
            minLength: 1,
            examples: [
`using UnityEngine;
using UnityEditor;
using System;
using System.Linq;
using System.Collections.Generic;
using System.IO;
using System.Reflection;

public class EditorCommand
{
    public static object Execute()
    {
        Selection.activeGameObject.transform.position = Vector3.zero;
        EditorApplication.isPlaying = !EditorApplication.isPlaying;
        return ""Success"";
    }
}`,
            ]
          }
        },
        required: ['code'],
        additionalProperties: false
      },
      returns: {
        type: 'object',
        description: 'Returns the execution result and any logs generated during execution',
        format: 'JSON object containing "result" and "logs" fields'
      },
      errorHandling: {
        description: 'Common error scenarios and their handling:',
        scenarios: [
          {
            error: 'Compilation error',
            handling: 'Returns compilation error details in logs'
          },
          {
            error: 'Runtime exception',
            handling: 'Returns exception details and stack trace'
          },
          {
            error: 'Timeout',
            handling: 'Command execution timeout after 5 seconds'
          }
        ]
      },
      examples: [
        {
          description: 'Center selected object',
          input: {
            code: 'var selected = Selection.activeGameObject; if(selected != null) { selected.transform.position = Vector3.zero; }'
          },
          output: '{ "result": true, "logs": ["[UnityMCP] Command executed successfully"] }'
        }
      ]
    };
  }

  async execute(args: any, context: ToolContext) {
    // Validate code parameter
    if (!args?.code) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'The code parameter is required'
      );
    }
    
    if (typeof args.code !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'The code parameter must be a string'
      );
    }

    if (args.code.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'The code parameter cannot be empty'
      );
    }

    try {
      // Clear previous logs and set command start time
      const startLogIndex = context.logBuffer.length;
      context.setCommandStartTime(Date.now());

      // Send command to Unity
      context.unityConnection!.send(JSON.stringify({
        type: 'executeEditorCommand',
        data: { 
          code: args.code,
        },
      }));

      // Wait for result with enhanced timeout handling
      const timeoutMs = 60_000;
      const result = await Promise.race([
        new Promise((resolve, reject) => {
          context.setCommandResultPromise({ resolve, reject });
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(
            `Command execution timed out after ${timeoutMs/1000} seconds. This may indicate a long-running operation or an issue with the Unity Editor.`
          )), timeoutMs)
        )
      ]);

      // Get logs that occurred during command execution
      const commandLogs = context.logBuffer
        .slice(startLogIndex)
        .filter(log => log.message.includes('[UnityMCP]'));

      // Calculate execution time
      const executionTime = Date.now() - (context.commandStartTime || 0);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              result,
              logs: commandLogs,
              executionTime: `${executionTime}ms`,
              status: 'success'
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      // Enhanced error handling with specific error types
      if (error instanceof Error) {
        if (error.message.includes('timed out')) {
          throw new McpError(
            ErrorCode.InternalError,
            error.message
          );
        }
        
        // Check for common Unity-specific errors
        if (error.message.includes('NullReferenceException')) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'The code attempted to access a null object. Please check that all GameObject references exist.'
          );
        }

        if (error.message.includes('CompileError')) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'C# compilation error. Please check the syntax of your code.'
          );
        }
      }

      // Generic error fallback
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
