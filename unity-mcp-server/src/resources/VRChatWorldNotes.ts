import { Resource, ResourceContext, ResourceDefinition } from "./types.js";

export class VRChatWorldNotes implements Resource {
  getDefinition(): ResourceDefinition {
    return {
      uri: "help:///vrchat/world-building-notes",
      name: "VRChatWorldNotes.md",
      mimeType: "text/plain",
      description:
        "VRChat world building notes and tips for UdonSharp and Unity.",
    };
  }

  async getContents(context: ResourceContext): Promise<string> {
    return vrChatWorldBuildingNotes;
  }
}

const vrChatWorldBuildingNotes = `

## General notes

This is a VRChat World Unity project that uses UdonSharp for scripting.
Put all new assets in the Assets/Game/ folder.

If you encounter errors and figure out how to resolve them, can you add/update a text file under 
the Assets/MCP/ folder so you can avoid making the same mistake again in future run. Name the file
something that will trigger you to read the file before performing the mistake prone operation. Try 
to keep individual files under 500 words total, so consolidate, compress and simplify files as needed. 

Also add general helper scripts to the Assets/MCP/ folder. These should be generic and reusable across multiple projects.
For example if you try something a bunch of times and get it to work, or have a long piece of common code that can save time.

Before making edits make sure you understand what already exists by examining what you need from the project.

Use multiple execute_editor_commands instead of trying to do everything in one command. 
Unity and UdonShare are complicated and there are many things that can go wrong. Save yourself time by using multiple, smaller commands.

If not sure, ask the user to clarify what they want to do.

Don't end lines with \\ to continue a string to the next line as that is not valid C#.

If there are other assemblies you need, or if you think is there a fundamental problem
with execute_editor_command, then stop executing and alert the user who can update the 
execute_editor_command scoftware. Ideally with a suggestion of what to do.

Context space for a single session is limited. If tasks can be broken out into sub jobs then  
describe the prompt to the user and the user will run the job separately, 
returning to the main job when complete.

## Rendering text

In Udon you can't use the legacy Unity TextMesh (or UI.Text) component directly because 
many of its methods and properties aren't exposed to Udon. Instead, you'll need to use 
a TextMeshPro-based component that is supported by VRChat's Udon.

If TextMeshPro is not installed, you can install it via the Unity Package Manager or prompt th user to do so.
    
# VRChat Components Reference

Further documenation can be found here https://creators.vrchat.com/worlds/components/
If you're not sure, look it up first to avoid compile errors. Update the notes to avoid having to do the same lookups.
`;
