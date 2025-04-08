using UnityEngine;
using UnityEditor;
using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Microsoft.CSharp;
using System.CodeDom.Compiler;

namespace UnityMCP.Editor
{
    [InitializeOnLoad]
    public class UnityMCPConnection
    {
        private static ClientWebSocket webSocket;
        private static bool isConnected = false;
        private static readonly Uri serverUri = new Uri("ws://localhost:8080");
        private static string lastErrorMessage = "";
        private static readonly Queue<LogEntry> logBuffer = new Queue<LogEntry>();
        private static readonly int maxLogBufferSize = 1000;
        private static bool isLoggingEnabled = true;

        // Public properties for the debug window
        public static bool IsConnected => isConnected;
        public static Uri ServerUri => serverUri;
        public static string LastErrorMessage => lastErrorMessage;
        public static bool IsLoggingEnabled
        {
            get => isLoggingEnabled;
            set
            {
                isLoggingEnabled = value;
                if (value)
                {
                    Application.logMessageReceived += HandleLogMessage;
                }
                else
                {
                    Application.logMessageReceived -= HandleLogMessage;
                }
            }
        }

        private class LogEntry
        {
            public string Message { get; set; }
            public string StackTrace { get; set; }
            public LogType Type { get; set; }
            public DateTime Timestamp { get; set; }
        }

        // Public method to manually retry connection
        public static void RetryConnection()
        {
            Debug.Log("[UnityMCP] Manually retrying connection...");
            ConnectToServer();
        }
        private static readonly CancellationTokenSource cts = new CancellationTokenSource();

        // Constructor called on editor startup
        static UnityMCPConnection()
        {
            // Start capturing logs before anything else
            Application.logMessageReceived += HandleLogMessage;
            isLoggingEnabled = true;

            Debug.Log("[UnityMCP] Plugin initialized");
            EditorApplication.delayCall += () =>
            {
                Debug.Log("[UnityMCP] Starting initial connection");
                ConnectToServer();
            };
            EditorApplication.update += Update;
        }

        private static void HandleLogMessage(string message, string stackTrace, LogType type)
        {
            if (!isLoggingEnabled) return;

            var logEntry = new LogEntry
            {
                Message = message,
                StackTrace = stackTrace,
                Type = type,
                Timestamp = DateTime.UtcNow
            };

            lock (logBuffer)
            {
                logBuffer.Enqueue(logEntry);
                while (logBuffer.Count > maxLogBufferSize)
                {
                    logBuffer.Dequeue();
                }
            }

            // Send log to server if connected
            if (isConnected && webSocket?.State == WebSocketState.Open)
            {
                SendLogToServer(logEntry);
            }
        }

        private static async void SendLogToServer(LogEntry logEntry)
        {
            try
            {
                var message = JsonConvert.SerializeObject(new
                {
                    type = "log",
                    data = new
                    {
                        message = logEntry.Message,
                        stackTrace = logEntry.StackTrace,
                        logType = logEntry.Type.ToString(),
                        timestamp = logEntry.Timestamp
                    }
                });

                var buffer = Encoding.UTF8.GetBytes(message);
                await webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, cts.Token);
            }
            catch (Exception e)
            {
                Debug.LogError($"[UnityMCP] Failed to send log to server: {e.Message}");
            }
        }

        public static string[] GetRecentLogs(LogType[] types = null, int count = 100)
        {
            lock (logBuffer)
            {
                var logs = logBuffer.ToArray()
                    .Where(log => types == null || types.Contains(log.Type))
                    .TakeLast(count)
                    .Select(log => $"[{log.Timestamp:yyyy-MM-dd HH:mm:ss}] [{log.Type}] {log.Message}")
                    .ToArray();
                return logs;
            }
        }

        private static async void ConnectToServer()
        {
            if (webSocket != null &&
                (webSocket.State == WebSocketState.Connecting ||
                 webSocket.State == WebSocketState.Open))
            {
                Debug.Log("[UnityMCP] Already connected or connecting");
                return;
            }

            try
            {
                Debug.Log($"[UnityMCP] Attempting to connect to MCP Server at {serverUri}");
                Debug.Log($"[UnityMCP] Current Unity version: {Application.unityVersion}");
                Debug.Log($"[UnityMCP] Current platform: {Application.platform}");

                webSocket = new ClientWebSocket();
                webSocket.Options.KeepAliveInterval = TimeSpan.FromSeconds(30);

                var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token, timeout.Token);

                await webSocket.ConnectAsync(serverUri, linkedCts.Token);
                isConnected = true;
                Debug.Log("[UnityMCP] Successfully connected to MCP Server");
                StartReceiving();
                StartSendingEditorState();
            }
            catch (OperationCanceledException)
            {
                lastErrorMessage = "[UnityMCP] Connection attempt timed out";
                Debug.LogError(lastErrorMessage);
                isConnected = false;
            }
            catch (WebSocketException we)
            {
                lastErrorMessage = $"[UnityMCP] WebSocket error: {we.Message}\nDetails: {we.InnerException?.Message}";
                Debug.LogError(lastErrorMessage);
                Debug.LogError($"[UnityMCP] Stack trace: {we.StackTrace}");
                isConnected = false;
            }
            catch (Exception e)
            {
                lastErrorMessage = $"[UnityMCP] Failed to connect to MCP Server: {e.Message}\nType: {e.GetType().Name}";
                Debug.LogError(lastErrorMessage);
                Debug.LogError($"[UnityMCP] Stack trace: {e.StackTrace}");
                isConnected = false;
            }
        }

        private static float reconnectTimer = 0f;
        private static readonly float reconnectInterval = 5f;

        private static void Update()
        {
            if (!isConnected && webSocket?.State != WebSocketState.Open)
            {
                reconnectTimer += Time.deltaTime;
                if (reconnectTimer >= reconnectInterval)
                {
                    Debug.Log("[UnityMCP] Attempting to reconnect...");
                    ConnectToServer();
                    reconnectTimer = 0f;
                }
            }
        }

        private static async void StartReceiving()
        {
            var buffer = new byte[1024 * 4];
            try
            {
                while (webSocket.State == WebSocketState.Open)
                {
                    var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        HandleMessage(message);
                    }
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"Error receiving message: {e.Message}");
                isConnected = false;
            }
        }

        private static void HandleMessage(string message)
        {
            try
            {
                var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(message);
                switch (data["type"].ToString())
                {
                    case "selectGameObject":
                        SelectGameObject(data["data"].ToString());
                        break;
                    case "togglePlayMode":
                        TogglePlayMode();
                        break;
                    case "executeEditorCommand":
                        ExecuteEditorCommand(data["data"].ToString());
                        break;
                    case "executeCommandBatch":
                        ExecuteCommandBatch(data["data"].ToString());
                        break;
                    case "createUdonSharpScript":
                        var scriptData = JsonConvert.DeserializeObject<UdonSharpScriptData>(data["data"].ToString());
                        CreateUdonSharpScript(scriptData.name, scriptData.code, scriptData.targetGameObject);
                        break;
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"Error handling message: {e.Message}");
            }
        }

        private static void ExecuteCommandBatch(string batchData)
        {
            try
            {
                var batchObj = JsonConvert.DeserializeObject<CommandBatchData>(batchData);
                if (batchObj.commands == null || batchObj.commands.Length == 0)
                {
                    Debug.LogWarning("[UnityMCP] Received empty command batch");
                    return;
                }

                Debug.Log($"[UnityMCP] Executing batch of {batchObj.commands.Length} commands");
                CSEditorHelper.ExecuteCommandBatch(batchObj.commands);

                // Send success response
                var successMessage = JsonConvert.SerializeObject(new
                {
                    type = "commandBatchResult",
                    data = new
                    {
                        success = true,
                        commandCount = batchObj.commands.Length
                    }
                });
                var buffer = Encoding.UTF8.GetBytes(successMessage);
                webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, cts.Token).Wait();
            }
            catch (Exception e)
            {
                Debug.LogError($"[UnityMCP] Failed to execute command batch: {e.Message}");

                // Send error response
                var errorMessage = JsonConvert.SerializeObject(new
                {
                    type = "commandBatchResult",
                    data = new
                    {
                        success = false,
                        error = e.Message
                    }
                });
                var buffer = Encoding.UTF8.GetBytes(errorMessage);
                webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, cts.Token).Wait();
            }
        }

        private class CommandBatchData
        {
            public string[] commands { get; set; }
        }

        private class UdonSharpScriptData
        {
            public string name { get; set; }
            public string code { get; set; }
            public string targetGameObject { get; set; }
        }

        private static void CreateUdonSharpScript(string scriptName, string scriptCode, string targetGameObjectPath = null)
        {
            try
            {
                // 1. Create the directory if it doesn't exist
                string scriptDirectory = "Assets/UdonSharp/Scripts";
                if (!System.IO.Directory.Exists(scriptDirectory))
                {
                    System.IO.Directory.CreateDirectory(scriptDirectory);
                }

                // 2. Create the script file
                string scriptPath = $"{scriptDirectory}/{scriptName}.cs";
                System.IO.File.WriteAllText(scriptPath, scriptCode);
                AssetDatabase.Refresh();

                Debug.Log($"[UnityMCP] Created UdonSharp script at {scriptPath}");

                // 3. If a target GameObject is specified, try to attach the script after compilation
                if (!string.IsNullOrEmpty(targetGameObjectPath))
                {
                    // Need to wait for UdonSharp compilation to complete
                    EditorApplication.delayCall += () =>
                    {
                        // This code will run after UdonSharp has had a chance to compile the script
                        var attachCommand = $@"
                            try {{
                                // Find the target GameObject
                                GameObject targetObj = GameObject.Find(""{targetGameObjectPath}"");
                                if (targetObj == null)
                                {{
                                    Debug.LogError(""[UnityMCP] Target GameObject not found: {targetGameObjectPath}"");
                                    return ""GameObject not found"";
                                }}

                                // Use reflection to avoid direct dependencies on UdonSharp/VRChat types
                                var udonSharpBehaviourType = AppDomain.CurrentDomain.GetAssemblies()
                                    .SelectMany(a => a.GetTypes())
                                    .FirstOrDefault(t => t.FullName == ""UdonSharp.UdonSharpBehaviour"");
                                
                                if (udonSharpBehaviourType == null)
                                {{
                                    Debug.LogError(""[UnityMCP] UdonSharpBehaviour type not found. Is UdonSharp installed?"");
                                    return ""UdonSharp not installed"";
                                }}

                                var udonSharpEditorType = AppDomain.CurrentDomain.GetAssemblies()
                                    .SelectMany(a => a.GetTypes())
                                    .FirstOrDefault(t => t.FullName == ""UdonSharp.UdonSharpProgramAsset"" || 
                                                        t.FullName == ""UdonSharp.UdonSharpEditorUtility"" ||
                                                        t.FullName.Contains("".UdonSharpUtils""));

                                if (udonSharpEditorType == null)
                                {{
                                    Debug.LogError(""[UnityMCP] UdonSharp editor utilities not found"");
                                    return ""UdonSharp editor utilities not found"";
                                }}

                                // Try to find the compiled program asset through AssetDatabase
                                var guids = AssetDatabase.FindAssets(""{scriptName} t:UdonSharpProgramAsset"");
                                if (guids == null || guids.Length == 0)
                                {{
                                    Debug.LogError(""[UnityMCP] Could not find compiled UdonSharp program asset for {scriptName}"");
                                    return ""Program asset not found"";
                                }}

                                string assetPath = AssetDatabase.GUIDToAssetPath(guids[0]);
                                var programAsset = AssetDatabase.LoadAssetAtPath(assetPath, typeof(UnityEngine.Object));

                                // Add UdonBehaviour component and assign the program
                                var udonBehaviourType = AppDomain.CurrentDomain.GetAssemblies()
                                    .SelectMany(a => a.GetTypes())
                                    .FirstOrDefault(t => t.FullName == ""VRC.Udon.UdonBehaviour"");

                                if (udonBehaviourType == null)
                                {{
                                    Debug.LogError(""[UnityMCP] UdonBehaviour type not found. Is VRChat SDK installed?"");
                                    return ""VRChat SDK not installed"";
                                }}

                                // Add UdonBehaviour component
                                var udonBehaviour = targetObj.AddComponent(udonBehaviourType);
                                
                                // Set the program source field using reflection
                                var programSourceField = udonBehaviourType.GetField(""programSource"") ?? 
                                                       udonBehaviourType.GetProperty(""programSource"")?.GetSetMethod();
                                
                                if (programSourceField != null)
                                {{
                                    if (programSourceField is FieldInfo field)
                                    {{
                                        field.SetValue(udonBehaviour, programAsset);
                                    }}
                                    else if (programSourceField is MethodInfo method)
                                    {{
                                        method.Invoke(udonBehaviour, new object[] {{ programAsset }});
                                    }}
                                    Debug.Log($""[UnityMCP] Successfully attached UdonSharp script {scriptName} to {targetGameObjectPath}"");
                                    return ""Success"";
                                }}
                                else
                                {{
                                    Debug.LogError(""[UnityMCP] Could not find programSource field on UdonBehaviour"");
                                    return ""Failed to set program source"";
                                }}
                            }}
                            catch (Exception e)
                            {{
                                Debug.LogError($""[UnityMCP] Error attaching UdonSharp script: {{e.Message}}\\n{{e.StackTrace}}"");
                                return $""Error: {{e.Message}}"";
                            }}
                        ";

                        // Execute the attachment code after a delay
                        CSEditorHelper.ExecuteCommand(attachCommand);
                    };
                }

                // Send success response
                var successMessage = JsonConvert.SerializeObject(new
                {
                    type = "udonSharpScriptCreated",
                    data = new
                    {
                        name = scriptName,
                        path = scriptPath,
                        success = true
                    }
                });
                var buffer = Encoding.UTF8.GetBytes(successMessage);
                webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, cts.Token).Wait();
            }
            catch (Exception e)
            {
                Debug.LogError($"[UnityMCP] Failed to create UdonSharp script: {e.Message}\n{e.StackTrace}");

                // Send error response
                var errorMessage = JsonConvert.SerializeObject(new
                {
                    type = "udonSharpScriptCreated",
                    data = new
                    {
                        name = scriptName,
                        success = false,
                        error = e.Message
                    }
                });
                var buffer = Encoding.UTF8.GetBytes(errorMessage);
                webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, cts.Token).Wait();
            }
        }

        private static void ExecuteEditorCommand(string commandData)
        {
            var logs = new List<string>();
            var errors = new List<string>();
            var warnings = new List<string>();

            Application.logMessageReceived += LogHandler;

            try
            {
                var commandObj = JsonConvert.DeserializeObject<EditorCommandData>(commandData);
                var code = commandObj.code;

                Debug.Log($"[UnityMCP] Executing command:\n{code}");
                // Execute the code directly in the Editor context
                try
                {
                    // Execute the provided code
                    var result = CSEditorHelper.ExecuteCommand(code);

                    // Send back detailed execution results
                    // Send back detailed execution results
                    var resultMessage = JsonConvert.SerializeObject(new
                    {
                        type = "commandResult",
                        data = new
                        {
                            result = result,
                            logs = logs,
                            errors = errors,
                            warnings = warnings,
                            executionSuccess = true
                        }
                    });
                    var buffer = Encoding.UTF8.GetBytes(resultMessage);
                    webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, cts.Token).Wait();
                }
                catch (Exception e)
                {
                    throw new Exception($"Failed to execute command: {e.Message}", e);
                }
            }
            catch (Exception e)
            {
                var error = $"[UnityMCP] Failed to execute editor command: {e.Message}\n{e.StackTrace}";
                Debug.LogError(error);

                // Send back error information
                var errorMessage = JsonConvert.SerializeObject(new
                {
                    type = "commandResult",
                    data = new
                    {
                        result = (object)null,
                        logs = logs,
                        errors = new List<string>(errors) { error },
                        warnings = warnings,
                        executionSuccess = false,
                        errorDetails = new
                        {
                            message = e.Message,
                            stackTrace = e.StackTrace,
                            type = e.GetType().Name
                        }
                    }
                });
                var buffer = Encoding.UTF8.GetBytes(errorMessage);
                webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, cts.Token).Wait();
            }
            finally
            {
                Application.logMessageReceived -= LogHandler;
            }

            void LogHandler(string message, string stackTrace, LogType type)
            {
                switch (type)
                {
                    case LogType.Log:
                        logs.Add(message);
                        break;
                    case LogType.Warning:
                        warnings.Add(message);
                        break;
                    case LogType.Error:
                    case LogType.Exception:
                        errors.Add($"{message}\n{stackTrace}");
                        break;
                }
            }
        }

        private class EditorCommandData
        {
            public string code { get; set; }
        }

        private static void SelectGameObject(string objectPath)
        {
            var obj = GameObject.Find(objectPath);
            if (obj != null)
            {
                Selection.activeGameObject = obj;
            }
            else
            {
                Debug.LogWarning($"GameObject not found: {objectPath}");
            }
        }

        private static void TogglePlayMode()
        {
            EditorApplication.isPlaying = !EditorApplication.isPlaying;
        }

        private static async void StartSendingEditorState()
        {
            while (isConnected && webSocket.State == WebSocketState.Open)
            {
                try
                {
                    var state = GetEditorState();
                    var message = JsonConvert.SerializeObject(new
                    {
                        type = "editorState",
                        data = state
                    });
                    var buffer = Encoding.UTF8.GetBytes(message);
                    await webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, cts.Token);
                    await Task.Delay(1000); // Update every second
                }
                catch (Exception e)
                {
                    Debug.LogError($"Error sending editor state: {e.Message}");
                    isConnected = false;
                    break;
                }
            }
        }

        private static object GetEditorState()
        {
            try
            {
                var activeGameObjects = new List<string>();
                var selectedObjects = new List<string>();

                // Use FindObjectsByType instead of FindObjectsOfType
                var foundObjects = GameObject.FindObjectsByType<GameObject>(FindObjectsSortMode.None);
                if (foundObjects != null)
                {
                    foreach (var obj in foundObjects)
                    {
                        if (obj != null && !string.IsNullOrEmpty(obj.name))
                        {
                            activeGameObjects.Add(obj.name);
                        }
                    }
                }

                var selection = Selection.gameObjects;
                if (selection != null)
                {
                    foreach (var obj in selection)
                    {
                        if (obj != null && !string.IsNullOrEmpty(obj.name))
                        {
                            selectedObjects.Add(obj.name);
                        }
                    }
                }

                var currentScene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
                var sceneHierarchy = currentScene.IsValid() ? GetSceneHierarchy() : new List<object>();

                var projectStructure = new
                {
                    scenes = GetSceneNames() ?? new string[0],
                    prefabs = GetPrefabPaths() ?? new string[0],
                    scripts = GetScriptPaths() ?? new string[0]
                };

                return new
                {
                    activeGameObjects,
                    selectedObjects,
                    playModeState = EditorApplication.isPlaying ? "Playing" : "Stopped",
                    sceneHierarchy,
                    projectStructure
                };
            }
            catch (Exception e)
            {
                lastErrorMessage = $"Error getting editor state: {e.Message}";
                Debug.LogError(lastErrorMessage);
                return new
                {
                    activeGameObjects = new List<string>(),
                    selectedObjects = new List<string>(),
                    playModeState = "Unknown",
                    sceneHierarchy = new List<object>(),
                    projectStructure = new { scenes = new string[0], prefabs = new string[0], scripts = new string[0] }
                };
            }
        }

        private static object GetSceneHierarchy()
        {
            try
            {
                var roots = new List<object>();
                var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();

                if (scene.IsValid())
                {
                    var rootObjects = scene.GetRootGameObjects();
                    if (rootObjects != null)
                    {
                        foreach (var root in rootObjects)
                        {
                            if (root != null)
                            {
                                try
                                {
                                    roots.Add(GetGameObjectHierarchy(root));
                                }
                                catch (Exception e)
                                {
                                    Debug.LogWarning($"[UnityMCP] Failed to get hierarchy for {root.name}: {e.Message}");
                                }
                            }
                        }
                    }
                }

                return roots;
            }
            catch (Exception e)
            {
                lastErrorMessage = $"Error getting scene hierarchy: {e.Message}";
                Debug.LogError(lastErrorMessage);
                return new List<object>();
            }
        }

        private static object GetGameObjectHierarchy(GameObject obj)
        {
            try
            {
                if (obj == null) return null;

                var children = new List<object>();
                var transform = obj.transform;

                if (transform != null)
                {
                    for (int i = 0; i < transform.childCount; i++)
                    {
                        try
                        {
                            var childTransform = transform.GetChild(i);
                            if (childTransform != null && childTransform.gameObject != null)
                            {
                                var childHierarchy = GetGameObjectHierarchy(childTransform.gameObject);
                                if (childHierarchy != null)
                                {
                                    children.Add(childHierarchy);
                                }
                            }
                        }
                        catch (Exception e)
                        {
                            Debug.LogWarning($"[UnityMCP] Failed to process child {i} of {obj.name}: {e.Message}");
                        }
                    }
                }

                return new
                {
                    name = obj.name ?? "Unnamed",
                    components = GetComponentNames(obj),
                    children = children
                };
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[UnityMCP] Failed to get hierarchy for {(obj != null ? obj.name : "null")}: {e.Message}");
                return null;
            }
        }

        private static string[] GetComponentNames(GameObject obj)
        {
            try
            {
                if (obj == null) return new string[0];

                var components = obj.GetComponents<Component>();
                if (components == null) return new string[0];

                var validComponents = new List<string>();
                foreach (var component in components)
                {
                    try
                    {
                        if (component != null)
                        {
                            validComponents.Add(component.GetType().Name);
                        }
                    }
                    catch (Exception e)
                    {
                        Debug.LogWarning($"[UnityMCP] Failed to get component name: {e.Message}");
                    }
                }

                return validComponents.ToArray();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[UnityMCP] Failed to get component names for {(obj != null ? obj.name : "null")}: {e.Message}");
                return new string[0];
            }
        }

        private static object GetProjectStructure()
        {
            // Simplified project assets structure
            return new
            {
                scenes = GetSceneNames(),
                prefabs = GetPrefabPaths(),
                scripts = GetScriptPaths()
            };
        }

        private static string[] GetSceneNames()
        {
            var scenes = new List<string>();
            foreach (var scene in EditorBuildSettings.scenes)
            {
                scenes.Add(scene.path);
            }
            return scenes.ToArray();
        }

        private static string[] GetPrefabPaths()
        {
            var guids = AssetDatabase.FindAssets("t:Prefab");
            var paths = new string[guids.Length];
            for (int i = 0; i < guids.Length; i++)
            {
                paths[i] = AssetDatabase.GUIDToAssetPath(guids[i]);
            }
            return paths;
        }

        private static string[] GetScriptPaths()
        {
            var guids = AssetDatabase.FindAssets("t:Script");
            var paths = new string[guids.Length];
            for (int i = 0; i < guids.Length; i++)
            {
                paths[i] = AssetDatabase.GUIDToAssetPath(guids[i]);
            }
            return paths;
        }

        public static class CSEditorHelper
        {
            public static object ExecuteCommand(string code)
            {
                // Allow defining classes and functions at the root level
                string wrappedCode = $@"
                    using UnityEngine;
                    using UnityEditor;
                    using System;
                    using System.Linq;
                    using System.Collections.Generic;
                    using System.IO;
                    using System.Reflection;

                    namespace CodeExecution
                    {{
                        {code}

                        public class MainExecutor
                        {{
                            public static object Execute()
                            {{
                                return ""Success"";
                            }}
                        }}
                    }}
                ";

                // Use Mono's built-in compiler
                var options = new System.CodeDom.Compiler.CompilerParameters
                {
                    GenerateInMemory = true
                };

                // Add necessary references
                options.ReferencedAssemblies.Add(typeof(UnityEngine.Object).Assembly.Location);
                options.ReferencedAssemblies.Add(typeof(UnityEditor.Editor).Assembly.Location);
                options.ReferencedAssemblies.Add(typeof(System.Linq.Enumerable).Assembly.Location); // Add System.Core for LINQ
                options.ReferencedAssemblies.Add(typeof(object).Assembly.Location); // Add mscorlib
                options.ReferencedAssemblies.Add(typeof(Dictionary<,>).Assembly.Location); // Add System.Collections for Dictionary
                options.ReferencedAssemblies.Add(AppDomain.CurrentDomain.GetAssemblies()
                    .First(a => a.GetName().Name == "netstandard").Location); // Add netstandard

                // Add Unity Physics assembly reference for Rigidbody and other physics components
                var unityEnginePhysics = AppDomain.CurrentDomain.GetAssemblies()
                    .FirstOrDefault(a => a.GetName().Name == "UnityEngine.PhysicsModule");
                if (unityEnginePhysics != null)
                {
                    options.ReferencedAssemblies.Add(unityEnginePhysics.Location);
                }

                // Add other common Unity modules that might be needed
                var commonModules = new[] {
                    "UnityEngine.CoreModule",
                    "UnityEngine.IMGUIModule",
                    "UnityEngine.AnimationModule",
                    "UnityEngine.UIModule",
                    "UnityEngine.TextRenderingModule"
                };

                foreach (var moduleName in commonModules)
                {
                    var assembly = AppDomain.CurrentDomain.GetAssemblies()
                        .FirstOrDefault(a => a.GetName().Name == moduleName);
                    if (assembly != null)
                    {
                        options.ReferencedAssemblies.Add(assembly.Location);
                    }
                }

                // Compile and execute
                using (var provider = new Microsoft.CSharp.CSharpCodeProvider())
                {
                    var results = provider.CompileAssemblyFromSource(options, wrappedCode);
                    if (results.Errors.HasErrors)
                    {
                        Debug.LogError($"Assembly references: {string.Join(", ", options.ReferencedAssemblies)}");
                        foreach (CompilerError error in results.Errors)
                        {
                            Debug.LogError($"Error {error.ErrorNumber}: {error.ErrorText}, Line {error.Line}");
                        }
                        var errors = string.Join("\n", results.Errors.Cast<CompilerError>().Select(e => e.ErrorText));
                        throw new Exception($"Compilation failed:\n{errors}");
                    }

                    var assembly = results.CompiledAssembly;
                    var type = assembly.GetType("CodeExecution.MainExecutor");
                    var method = type.GetMethod("Execute");
                    return method.Invoke(null, null);
                }
            }

            public static void ExecuteCommandBatch(string[] commands)
            {
                var results = new List<object>();
                var errors = new List<string>();

                for (int i = 0; i < commands.Length; i++)
                {
                    try
                    {
                        Debug.Log($"[UnityMCP] Executing command {i + 1}/{commands.Length}");
                        var result = ExecuteCommand(commands[i]);
                        results.Add(result);
                    }
                    catch (Exception e)
                    {
                        var errorMessage = $"Command {i + 1} failed: {e.Message}";
                        Debug.LogError($"[UnityMCP] {errorMessage}");
                        errors.Add(errorMessage);
                    }
                }

                Debug.Log($"[UnityMCP] Batch execution completed. {results.Count} commands succeeded, {errors.Count} failed.");

                if (errors.Count > 0)
                {
                    Debug.LogWarning($"[UnityMCP] Errors during batch execution:\n{string.Join("\n", errors)}");
                }
            }
        }
    }
}