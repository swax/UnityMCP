Forked from [Arodoid/UnityMCP](https://github.com/Arodoid/UnityMCP) see that page for the
original README.md

## About 

This repo has been extensively refactored from the source. I've been testing using Claude/MCP/Unity to create
VRChat worlds. Claude has trouble getting UdonSharp scripts to compile so this repo supports 
MCP resources and helper scripts which improves it's success rate in building VRC worlds

This repo also has a many general improvements that work with normal Unity development. Try it out. 

## Improvements 

### Command Execution
- Changed how code is executed so that the LLM can define the usings, classes, and functions
  - Allows the LLM to execute more complex commands with multiple functions
- Stack traces eat up a lot of context so just return the first line which is usually enough
- Incorporated references for various modules:
  - .Net Standard
  - System.Core, System.IO
  - TextMeshPro assembly
  - VRChat assemblies
  - Unity Physics
  - A reference to MCPUnity itself so you can provide helper functions to MCP commands

### Unity Editor Integration
- Added functionality to wait/retry when Unity is not connected to process commands
- Changed `getEditorState` to run on demand instead of continuously
- Implemented waiting for pending compilations when getting editor state and running commands
- Revised GetAssets to retrieve all content from the Assets/ folder

### Manual Script Testing
- Created a script tester for diagnosing C# script commands
- Allows manually executing editor commands with detailed logging

### MCP Resources
- Any files added to resources/text will be exposed as a MCP resource

### Performance
- Fixed MCP window high CPU usage by only repainting when changes are detected
- Enabled support for commands longer than 4KB in Unity
- Reduced excessive debug logs during reconnection process

### Code Refactoring
- Refactored Unity connection into its own dedicated file
- Separated MCP server tools into individual files
  - With a common interface to make adding new tools easier
- Split editor state reporting and command execution into their own files

### VRChat Specific features
- Added a helper script that supports generating UdonSharp asset files from C# files

## How to Use

- Build the MCP Server from unity-mcp-server/
  - `npm install`
  - `npm run build`

- In Unity
  - Copy over the UnityMCPPlugin/ directory into your Assets folder
  - You should now see a UnityMCP menu in your project
    - Select `Debug Window` and dock by your projects

- In Claude Desktop
  - Enable developer mode
  - Add the MCP server in File/Settings
  ```
  {
      "mcpServers": {
          "unity": {
              "command": "node",
              "args": [
                  "C:\\git\\UnityMCP\\unity-mcp-server\\build\\index.js"
              ]
          }
      }
  }
  ```
  - Verify in the UnityMCP Debug Window, the Connection Status is green/connected
  - Enter your prompt
    - Click the attach button below the prompt to add resource artifacts
    - Any file you add to the resources/text folder is exposed as a resource
      - You need to build the project and restart Claude for it to see new resources
  - Run your prompt
    - You should see scripts executing
    - If there are script errors you can diagnose them in Unity
      - The UnityMCP menu has a Script Tester where you can paste in scripts to run them manually

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).
