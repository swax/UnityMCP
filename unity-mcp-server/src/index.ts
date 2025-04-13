#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { UnityConnection } from "./communication/UnityConnection.js";
import { getAllResources, ResourceContext } from "./resources/index.js";
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
          resources: {},
        },
      },
    );

    // Initialize WebSocket Server for Unity communication
    this.unityConnection = new UnityConnection(8080);
    this.setupTools();
    this.setupResources();

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /** Optional resources the user can include in Claude Desktop to give additional context to the LLM */
  private setupResources() {
    const resources = getAllResources();

    // Set up the resource request handler
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (request) => {
        return {
          resources: resources.map((resource) => resource.getDefinition()),
        };
      },
    );

    // Read resource contents
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const uri = request.params.uri;
        const resource = resources.find((r) => r.getDefinition().uri === uri);

        if (!resource) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Resource not found: ${uri}. Available resources: ${resources
              .map((r) => r.getDefinition().uri)
              .join(", ")}`,
          );
        }

        const resourceContext: ResourceContext = {
          unityConnection: this.unityConnection,
          // Add any other context properties needed
        };

        const content = await resource.getContents(resourceContext);

        return {
          contents: [
            {
              uri,
              mimeType: resource.getDefinition().mimeType,
              text: content,
            },
          ],
        };
      },
    );
  }

  private setupTools() {
    const tools = getAllTools();

    // List available tools with comprehensive documentation
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map((tool) => tool.getDefinition()),
    }));

    // Handle tool calls with enhanced validation and error handling
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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

      // Try executing with retry logic for connection issues
      let retryCount = 0;
      const maxRetries = 5;
      const retryDelay = 5000; // 5 seconds

      while (true) {
        // Verify Unity connection with detailed error message
        if (!this.unityConnection.isConnected()) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.error(`Unity Editor not connected. Retrying in 5 seconds... (${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          throw new McpError(
            ErrorCode.InternalError,
            "Unity Editor is not connected. Please ensure the Unity Editor is running and the UnityMCP window is open.",
          );
        }

        // Create context object for tool execution
        const toolContext: ToolContext = {
          unityConnection: this.unityConnection,
          logBuffer: this.unityConnection.getLogBuffer(),
        };

        // Execute the tool
        return await tool.execute(args, toolContext);
      }
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
