import { UnityConnection } from "../communication/UnityConnection.js";

export interface ResourceDefinition {
  uri: string;
  name: string;
  mimeType: string;
  description?: string;
}

export interface ResourceContext {
  unityConnection: UnityConnection;
  // Add any other context properties needed by resources
}

export interface Resource {
  getDefinition(): ResourceDefinition;
  getContents(context: ResourceContext): Promise<string>;
}
