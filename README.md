Forked from [Arodoid/UnityMCP](https://github.com/Arodoid/UnityMCP/commits/main/) see that page for the
original README.md

## About 

This repo was extensively refactored from the soure. I've been testing using Claude/MCP/Unity to create
VRChat worlds. It works ok. It has trouble reliably compiling and attaching UndonSharp assets to behaviors. 

### Unity Editor Integration
- Added functionality to wait/retry when Unity is not connected to process commands
- Changed `getEditorState` to run on demand instead of continuously
- Implemented waiting for pending compilations when getting editor state and running commands
- Revised GetAssets to retrieve all content from the Assets/ folder

### Performance Improvements
- Fixed MCP window high CPU usage by only repainting when changes are detected
- Enabled support for commands longer than 4KB in Unity
- Reduced excessive debug logs during reconnection process

### Code Refactoring
- Refactored Unity connection into its own dedicated file
- Separated MCP server tools into individual files
  - With a common interface to make adding new tools easier
- Split editor state reporting and command execution into their own files

### Command Execution Improvements
- Changed how code is executed so that the LLM can define the usings, classes, and functions
  - Allows the LLM to exectute more complex commands with multiple functions
- Incorporated references for various modules:
  - .Net Standard
  - System.Core, System.IO
  - TextMeshPro assembly
  - VRChat assemblies
  - Unity Physics

### Script Testing
- Created a script tester for diagnosing C# script commands
- Allows manually executing editor commands with detailed logging

### Resource Management
- Added support for MCP resources
- Implemented a VRChat-specific resource
- Transitioned from VRChat notes to Unity-stored notes

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).
