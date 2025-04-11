import { VRChatWorldNotes } from "./VRChatWorldNotes.js";
import { Resource } from "./types.js";

export * from "./types.js";

export function getAllResources(): Resource[] {
  return [
    new VRChatWorldNotes(),
    // Add more resources here as they are implemented
  ];
}
