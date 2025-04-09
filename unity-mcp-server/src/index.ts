#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';
import { 
  getAllTools, 
  UnityEditorState, 
  LogEntry, 
  CommandResult, 
  ToolContext 
} from './tools/index.js';

class UnityMCPServer {
  private server: Server;
  private wsServer: WebSocketServer;
  private unityConnection: WebSocket | null = null;
  private editorState: UnityEditorState = {
    activeGameObjects: [],
    selectedObjects: [],
    playModeState: 'Stopped',
    sceneHierarchy: {},
    projectStructure: {}
  };

  private logBuffer: LogEntry[] = [];
  private readonly maxLogBufferSize = 1000;
  
  // Add command result promise handling
  private commandResultPromise: {
    resolve: (value: CommandResult) => void;
    reject: (reason?: any) => void;
  } | null = null;
  private commandStartTime: number | null = null;

  constructor() {
    // Initialize MCP Server
    this.server = new Server(
      {
        name: 'unity-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize WebSocket Server for Unity communication
    this.wsServer = new WebSocketServer({ port: 8080 });
    this.setupWebSocket();
    this.setupTools();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private setupWebSocket() {
    console.error('[Unity MCP] WebSocket server starting on port 8080');
    
    this.wsServer.on('listening', () => {
      console.error('[Unity MCP] WebSocket server is listening for connections');
    });

    this.wsServer.on('error', (error) => {
      console.error('[Unity MCP] WebSocket server error:', error);
    });

    this.wsServer.on('connection', (ws: WebSocket) => {
      console.error('[Unity MCP] Unity Editor connected');
      this.unityConnection = ws;

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          console.error('[Unity MCP] Received message:', message.type);
          this.handleUnityMessage(message);
        } catch (error) {
          console.error('[Unity MCP] Error handling message:', error);
        }
      });

      ws.on('error', (error) => {
        console.error('[Unity MCP] WebSocket error:', error);
      });

      ws.on('close', () => {
        console.error('[Unity MCP] Unity Editor disconnected');
        this.unityConnection = null;
      });
    });
  }

  private handleUnityMessage(message: any) {
    switch (message.type) {
      case 'editorState':
        // Create a simplified version of the state
        const filteredData: UnityEditorState = {
          activeGameObjects: message.data.activeGameObjects || [],
          selectedObjects: message.data.selectedObjects || [],
          playModeState: message.data.playModeState || 'Stopped',
          sceneHierarchy: message.data.sceneHierarchy || {},
          projectStructure: {}
        };

        // Filter project structure to only include user files
        if (message.data.projectStructure) {
          Object.keys(message.data.projectStructure).forEach(key => {
            if (Array.isArray(message.data.projectStructure[key])) {
              filteredData.projectStructure[key] = (message.data.projectStructure[key] as string[]).filter(
                (path: string) => !path.startsWith('Packages/')
              );
            }
          });
        }

        this.editorState = filteredData;
        break;
      
      case 'commandResult':
        // Resolve the pending command result promise
        if (this.commandResultPromise) {
          this.commandResultPromise.resolve(message.data as CommandResult);
          this.commandResultPromise = null;
        }
        break;

      case 'log':
        this.handleLogMessage(message.data);
        break;
      
      default:
        console.error('[Unity MCP] Unknown message type:', message.type);
    }
  }

  private setupTools() {
    const tools = getAllTools();
    
    // List available tools with comprehensive documentation
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map(tool => tool.getDefinition()),
    }));

    // Handle tool calls with enhanced validation and error handling
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Verify Unity connection with detailed error message
      if (!this.unityConnection) {
        throw new McpError(
          ErrorCode.InternalError,
          'Unity Editor is not connected. Please ensure the Unity Editor is running and the UnityMCP window is open.'
        );
      }

      const { name, arguments: args } = request.params;

      // Find the requested tool
      const tool = tools.find(t => t.getDefinition().name === name);

      // Validate tool exists with helpful error message
      if (!tool) {
        const availableTools = tools.map(t => t.getDefinition().name);
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available tools are: ${availableTools.join(', ')}`
        );
      }

      // Create context object for tool execution
      const toolContext: ToolContext = {
        unityConnection: this.unityConnection,
        editorState: this.editorState,
        logBuffer: this.logBuffer,
        commandResultPromise: this.commandResultPromise,
        commandStartTime: this.commandStartTime,
        setCommandResultPromise: (promise) => {
          this.commandResultPromise = promise;
        },
        setCommandStartTime: (time) => {
          this.commandStartTime = time;
        }
      };

      // Execute the tool
      return await tool.execute(args, toolContext);
    });
  }

  private handleLogMessage(logEntry: LogEntry) {
    // Add to buffer, removing oldest if at capacity
    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > this.maxLogBufferSize) {
      this.logBuffer.shift();
    }
  }

  private async cleanup() {
    if (this.unityConnection) {
      this.unityConnection.close();
    }
    this.wsServer.close();
    await this.server.close();
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Unity MCP server running on stdio');
    
    // Wait for WebSocket server to be ready
    await new Promise<void>((resolve) => {
      this.wsServer.once('listening', () => {
        console.error('[Unity MCP] WebSocket server is ready on port 8080');
        resolve();
      });
    });
  }
}

const server = new UnityMCPServer();
server.run().catch(console.error);
