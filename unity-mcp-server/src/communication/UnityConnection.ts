import { WebSocketServer, WebSocket } from 'ws';
import { UnityEditorState, LogEntry, CommandResult } from '../tools/index.js';

export interface CommandResultHandler {
  resolve: (value: CommandResult) => void;
  reject: (reason?: any) => void;
}

export class UnityConnection {
  private wsServer: WebSocketServer;
  private connection: WebSocket | null = null;
  private editorState: UnityEditorState = {
    activeGameObjects: [],
    selectedObjects: [],
    playModeState: 'Stopped',
    sceneHierarchy: {},
    projectStructure: {}
  };

  private logBuffer: LogEntry[] = [];
  private readonly maxLogBufferSize = 1000;
  
  private commandResultPromise: CommandResultHandler | null = null;
  private commandStartTime: number | null = null;

  // Event callbacks
  private onEditorStateUpdated: ((state: UnityEditorState) => void) | null = null;
  private onCommandResult: ((result: CommandResult) => void) | null = null;
  private onLogReceived: ((entry: LogEntry) => void) | null = null;

  constructor(port: number = 8080) {
    this.wsServer = new WebSocketServer({ port });
    this.setupWebSocket();
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
      this.connection = ws;

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
        this.connection = null;
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
        if (this.onEditorStateUpdated) {
          this.onEditorStateUpdated(filteredData);
        }
        break;
      
      case 'commandResult':
        // Resolve the pending command result promise
        if (this.commandResultPromise) {
          this.commandResultPromise.resolve(message.data as CommandResult);
          this.commandResultPromise = null;
        }
        if (this.onCommandResult) {
          this.onCommandResult(message.data as CommandResult);
        }
        break;

      case 'log':
        this.handleLogMessage(message.data);
        if (this.onLogReceived) {
          this.onLogReceived(message.data);
        }
        break;
      
      default:
        console.error('[Unity MCP] Unknown message type:', message.type);
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

  public getEditorState(): UnityEditorState {
    return this.editorState;
  }

  public getLogBuffer(): LogEntry[] {
    return [...this.logBuffer];
  }

  public setCommandResultPromise(promise: CommandResultHandler): void {
    this.commandResultPromise = promise;
  }

  public setCommandStartTime(time: number): void {
    this.commandStartTime = time;
  }

  public getCommandStartTime(): number | null {
    return this.commandStartTime;
  }

  public setOnEditorStateUpdated(callback: (state: UnityEditorState) => void): void {
    this.onEditorStateUpdated = callback;
  }

  public setOnCommandResult(callback: (result: CommandResult) => void): void {
    this.onCommandResult = callback;
  }

  public setOnLogReceived(callback: (entry: LogEntry) => void): void {
    this.onLogReceived = callback;
  }

  public sendMessage(type: string, data: any): void {
    if (this.connection) {
      this.connection.send(JSON.stringify({ type, data }));
    } else {
      console.error('[Unity MCP] Cannot send message: Unity Editor not connected');
    }
  }

  public async waitForConnection(timeoutMs: number = 30000): Promise<boolean> {
    if (this.connection) return true;
    
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), timeoutMs);
      
      const connectionHandler = () => {
        clearTimeout(timeout);
        this.wsServer.off('connection', connectionHandler);
        resolve(true);
      };
      
      this.wsServer.on('connection', connectionHandler);
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
