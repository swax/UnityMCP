# VRChat World Unity Project Notes

## Project Structure
- Put all new assets in the `Assets/Game/` folder
- Before making edits, examine existing components to understand what's already in place

## Development Best Practices
- Use multiple `execute_editor_commands` instead of trying to do everything in one command
- Unity and UdonSharp are complex environments with many potential issues
- Break down your tasks into smaller, more manageable commands

## Useful Commands

### Creating UdonSharp Asset Files
To create the corresponding asset file for UdonSharp scripts so you can attach them to components in Unity:
```csharp
UnityMCP.VRChatUtils.UdonSharpHelper.CreateAsset("Assets/Game/yourScript.cs");
```

### Compiling the Project
To compile the entire project and check for errors in the code:
```csharp
CompilationPipeline.RequestScriptCompilation();
```

## Rendering Text in Udon

Legacy Unity TextMesh (or UI.Text) components can't be used directly in Udon because many of their methods and properties aren't exposed. Instead:

- Use TextMeshPro-based components that are supported by VRChat's Udon
- If TextMeshPro is not installed, it can be added via the Unity Package Manager

## Code Guidelines
- Don't end lines with `\\` to continue a string to the next line as that is not valid C#
- If unsure about implementation, ask for clarification