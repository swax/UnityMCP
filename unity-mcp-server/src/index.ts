#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  CommandResultHandler,
  UnityConnection,
} from "./communication/UnityConnection.js";
import { getAllTools, ToolContext } from "./tools/index.js";

class UnityMCPServer {
  private server: Server;
  private unityConnection: UnityConnection;

  constructor() {
    // Initialize MCP Server
    this.server = new Server(
      {
        name: "unity-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Initialize WebSocket Server for Unity communication
    this.unityConnection = new UnityConnection(8080);
    this.setupTools();

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private setupTools() {
    const tools = getAllTools();

    // List available tools with comprehensive documentation
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map((tool) => tool.getDefinition()),
    }));

    // Handle tool calls with enhanced validation and error handling
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Verify Unity connection with detailed error message
      if (!this.unityConnection.isConnected()) {
        throw new McpError(
          ErrorCode.InternalError,
          "Unity Editor is not connected. Please ensure the Unity Editor is running and the UnityMCP window is open.",
        );
      }

      const { name, arguments: args } = request.params;

      // Find the requested tool
      const tool = tools.find((t) => t.getDefinition().name === name);

      // Validate tool exists with helpful error message
      if (!tool) {
        const availableTools = tools.map((t) => t.getDefinition().name);
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available tools are: ${availableTools.join(
            ", ",
          )}`,
        );
      }

      // Create context object for tool execution
      const toolContext: ToolContext = {
        unityConnection: this.unityConnection,
        editorState: this.unityConnection.getEditorState(),
        logBuffer: this.unityConnection.getLogBuffer(),
        commandResultPromise: null,
        commandStartTime: this.unityConnection.getCommandStartTime(),
        setCommandResultPromise: (promise: CommandResultHandler) => {
          this.unityConnection.setCommandResultPromise(promise);
        },
        setCommandStartTime: (time: number) => {
          this.unityConnection.setCommandStartTime(time);
        },
      };

      // Execute the tool
      return await tool.execute(args, toolContext);
    });
  }

  private async cleanup() {
    this.unityConnection.close();
    await this.server.close();
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Unity MCP server running on stdio");

    // Wait for WebSocket server to be ready
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100); // Small delay to ensure WebSocket server is initialized
    });
  }
}

const server = new UnityMCPServer();
server.run().catch(console.error);
