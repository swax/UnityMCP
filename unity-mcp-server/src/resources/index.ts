import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { loadTextResources } from "./TextResource.js";
import { Resource } from "./types.js";

export * from "./types.js";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to text resources relative to the built code
const textResourceDir = path.join(__dirname, "text");

export async function getAllResources(): Promise<Resource[]> {
  const staticResources: Resource[] = [
    // Add static resources here as they are implemented
  ];

  // Load dynamic text resources
  const textResources = await loadTextResources(textResourceDir);

  return [...staticResources, ...textResources];
}
