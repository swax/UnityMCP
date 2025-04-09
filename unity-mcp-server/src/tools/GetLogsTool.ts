import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Tool, ToolDefinition, ToolContext, LogEntry } from './types.js';

export class GetLogsTool implements Tool {
  getDefinition(): ToolDefinition {
    return {
      name: 'get_logs',
      description: 'Retrieve and filter Unity Editor logs with comprehensive filtering options. This tool provides access to editor logs, console messages, warnings, errors, and exceptions with powerful filtering capabilities.',
      category: 'Debugging',
      tags: ['unity', 'editor', 'logs', 'debugging', 'console'],
      inputSchema: {
        type: 'object',
        properties: {
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['Log', 'Warning', 'Error', 'Exception'],
              description: 'Log entry types to include'
            },
            description: 'Filter logs by type. If not specified, all types are included.',
            examples: [['Error', 'Exception'], ['Log', 'Warning']]
          },
          count: {
            type: 'number',
            description: 'Maximum number of log entries to return',
            minimum: 1,
            maximum: 1000,
            default: 100
          },
          fields: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['message', 'stackTrace', 'logType', 'timestamp']
            },
            description: 'Specify which fields to include in the output. If not specified, all fields are included.',
            examples: [['message', 'logType'], ['message', 'stackTrace', 'timestamp']]
          },
          messageContains: {
            type: 'string',
            description: 'Filter logs to only include entries where the message contains this string (case-sensitive)',
            minLength: 1
          },
          stackTraceContains: {
            type: 'string',
            description: 'Filter logs to only include entries where the stack trace contains this string (case-sensitive)',
            minLength: 1
          },
          timestampAfter: {
            type: 'string',
            description: 'Filter logs after this ISO timestamp (inclusive)',
            format: 'date-time',
            example: '2024-01-14T00:00:00Z'
          },
          timestampBefore: {
            type: 'string',
            description: 'Filter logs before this ISO timestamp (inclusive)',
            format: 'date-time',
            example: '2024-01-14T23:59:59Z'
          }
        },
        additionalProperties: false
      },
      returns: {
        type: 'array',
        description: 'Returns an array of log entries matching the specified filters',
        format: 'Array of objects containing requested log entry fields'
      },
      examples: [
        {
          description: 'Get recent error logs',
          input: {
            types: ['Error', 'Exception'],
            count: 10,
            fields: ['message', 'timestamp']
          },
          output: '[{"message": "NullReferenceException", "timestamp": "2024-01-14T12:00:00Z"}, ...]'
        },
        {
          description: 'Search logs for specific message',
          input: {
            messageContains: 'Player',
            fields: ['message', 'logType']
          },
          output: '[{"message": "Player position updated", "logType": "Log"}, ...]'
        }
      ]
    };
  }

  async execute(args: any, context: ToolContext) {
    const options = {
      types: args?.types as string[] | undefined,
      count: args?.count as number || 100,
      fields: args?.fields as string[] | undefined,
      messageContains: args?.messageContains as string | undefined,
      stackTraceContains: args?.stackTraceContains as string | undefined,
      timestampAfter: args?.timestampAfter as string | undefined,
      timestampBefore: args?.timestampBefore as string | undefined
    };
    
    const logs = this.filterLogs(context.logBuffer, options);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(logs, null, 2),
        },
      ],
    };
  }

  private filterLogs(logBuffer: LogEntry[], options: {
    types?: string[],
    count?: number,
    fields?: string[],
    messageContains?: string,
    stackTraceContains?: string,
    timestampAfter?: string,
    timestampBefore?: string
  }): any[] {
    const {
      types,
      count = 100,
      fields,
      messageContains,
      stackTraceContains,
      timestampAfter,
      timestampBefore
    } = options;

    // First apply all filters
    let filteredLogs = logBuffer
      .filter(log => {
        // Type filter
        if (types && !types.includes(log.logType)) return false;
        
        // Message content filter
        if (messageContains && !log.message.includes(messageContains)) return false;
        
        // Stack trace content filter
        if (stackTraceContains && !log.stackTrace.includes(stackTraceContains)) return false;
        
        // Timestamp filters
        if (timestampAfter && new Date(log.timestamp) < new Date(timestampAfter)) return false;
        if (timestampBefore && new Date(log.timestamp) > new Date(timestampBefore)) return false;
        
        return true;
      });

    // Then apply count limit
    filteredLogs = filteredLogs.slice(-count);

    // Finally apply field selection if specified
    if (fields?.length) {
      return filteredLogs.map(log => {
        const selectedFields: Partial<LogEntry> = {};
        fields.forEach(field => {
          if (field in log && (field === 'message' || field === 'stackTrace' ||
              field === 'logType' || field === 'timestamp')) {
            selectedFields[field as keyof LogEntry] = log[field as keyof LogEntry];
          }
        });
        return selectedFields;
      });
    }

    return filteredLogs;
  }
}
