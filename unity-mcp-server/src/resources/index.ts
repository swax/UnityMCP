import { UdonScriptExample } from "./UdonScriptExample.js";
import { Resource } from "./types.js";

export * from "./types.js";

export function getAllResources(): Resource[] {
  return [
    new UdonScriptExample(),
    // Add more resources here as they are implemented
  ];
}
