import { WebSocket, WebSocketServer } from "ws";
import { CommandResult, resolveCommandResult } from "../tools/ExecuteEditorCommandTool.js";
import { LogEntry } from "../tools/index.js";
import { resolveUnityEditorState, UnityEditorState } from "../tools/GetEditorStateTool.js";

export class UnityConnection {
  private wsServer: WebSocketServer;
  private connection: WebSocket | null = null;

  private logBuffer: LogEntry[] = [];
  private readonly maxLogBufferSize = 1000;

  // Event callbacks
  private onLogReceived: ((entry: LogEntry) => void) | null = null;

  constructor(port: number = 8080) {
    this.wsServer = new WebSocketServer({ port });
    this.setupWebSocket();
  }

  private setupWebSocket() {
    console.error("[Unity MCP] WebSocket server starting on port 8080");

    this.wsServer.on("listening", () => {
      console.error(
        "[Unity MCP] WebSocket server is listening for connections",
      );
    });

    this.wsServer.on("error", (error) => {
      console.error("[Unity MCP] WebSocket server error:", error);
    });

    this.wsServer.on("connection", (ws: WebSocket) => {
      console.error("[Unity MCP] Unity Editor connected");
      this.connection = ws;

      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          console.error("[Unity MCP] Received message:", message.type);
          this.handleUnityMessage(message);
        } catch (error) {
          console.error("[Unity MCP] Error handling message:", error);
        }
      });

      ws.on("error", (error) => {
        console.error("[Unity MCP] WebSocket error:", error);
      });

      ws.on("close", () => {
        console.error("[Unity MCP] Unity Editor disconnected");
        this.connection = null;
      });
    });
  }

  private handleUnityMessage(message: any) {
    switch (message.type) {
      case "commandResult":
        resolveCommandResult(message.data as CommandResult);
        break;

      case "editorState":
        resolveUnityEditorState(message.data as UnityEditorState);
        break;

      case "log":
        this.handleLogMessage(message.data);
        if (this.onLogReceived) {
          this.onLogReceived(message.data);
        }
        break;

      default:
        console.error("[Unity MCP] Unknown message type:", message.type);
    }
  }

  private handleLogMessage(logEntry: LogEntry) {
    // Add to buffer, removing oldest if at capacity
    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > this.maxLogBufferSize) {
      this.logBuffer.shift();
    }
  }

  // Public API
  public isConnected(): boolean {
    return this.connection !== null;
  }

  public getLogBuffer(): LogEntry[] {
    return [...this.logBuffer];
  }

  public setOnLogReceived(callback: (entry: LogEntry) => void): void {
    this.onLogReceived = callback;
  }

  public sendMessage(type: string, data: any): void {
    if (this.connection) {
      this.connection.send(JSON.stringify({ type, data }));
    } else {
      console.error(
        "[Unity MCP] Cannot send message: Unity Editor not connected",
      );
    }
  }

  public async waitForConnection(timeoutMs: number = 60000): Promise<boolean> {
    if (this.connection) return true;

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), timeoutMs);

      const connectionHandler = () => {
        clearTimeout(timeout);
        this.wsServer.off("connection", connectionHandler);
        resolve(true);
      };

      this.wsServer.on("connection", connectionHandler);
    });
  }

  public close(): void {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    this.wsServer.close();
  }
}
