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

Before making edits make sure you understand what already exists by examining what you need from the project.

Use multiple execute_editor_commands instead of trying to do everything in one command. 
Unity and UdonShare are complicated and there are many things that can go wrong. Save yourself time by using multiple, smaller commands.

If not sure, ask the user to clarify what they want to do.

Don't end lines with \\ to continue a string to the next line as that is not valid C#.

## Rendering text

In Udon you can't use the legacy Unity TextMesh (or UI.Text) component directly because 
many of its methods and properties aren't exposed to Udon. Instead, you'll need to use 
a TextMeshPro-based component that is supported by VRChat's Udon.

If TextMeshPro is not installed, you can install it via the Unity Package Manager or prompt th user to do so.


## These are the current assemblies included for execute_editor_command:

AddAssemblyReference(typeof(UnityEngine.Object).Assembly.Location);
AddAssemblyReference(typeof(UnityEditor.Editor).Assembly.Location);


AddAssemblyReference(typeof(System.Linq.Enumerable).Assembly.Location); // Add System.Core for LINQ
AddAssemblyReference(typeof(object).Assembly.Location); // Add mscorlib

// Add netstandard assembly
var netstandardAssembly = AppDomain.CurrentDomain.GetAssemblies()
    .FirstOrDefault(a => a.GetName().Name == "netstandard");
if (netstandardAssembly != null)
{
    AddAssemblyReference(netstandardAssembly.Location);
}

// Add common Unity modules
var commonModules = new[] {
    "UnityEngine.CoreModule",
    "UnityEngine.PhysicsModule",
    "UnityEngine.IMGUIModule",
    "UnityEngine.AnimationModule",
    "UnityEngine.UIModule",
    "UnityEngine.TextRenderingModule",
    "Unity.TextMeshPro",       // Added for TextMeshPro
    "Unity.TextMeshPro.Editor" // Added for TextMeshPro Editor functionality
};

// Add VRChat Udon and UdonSharp assemblies
var vrchatAssemblies = new[] {
    "VRC.Udon",
    "VRC.Udon.Common",
    "VRC.Udon.Editor",
    "VRC.Udon.Serialization.OdinSerializer",
    "VRC.Udon.VM",
    "VRC.Udon.Wrapper",
    "UdonSharp.Editor",
    "UdonSharp.Runtime",
    "VRCSDK3",
    "VRCSDKBase", // Additional VRC SDK parts that might be needed
};

If there are other assemblies you need, or if you think is there a fundamental problem
with execute_editor_command, then stop executing and alert the user who can update the 
execute_editor_command scoftware. Ideally with a suggestion of what to do.


## Creating UdonSharp assets and wiring them up is very failure prone. It is strongly suggested that you use this method.

using UnityEngine;
using UnityEditor;
using System;
using System.Linq;
using System.Reflection;
using UdonSharp;
using VRC.Udon;
using UdonSharpEditor;
using UdonSharp.Compiler;

public class EditorCommand
{
    public static object Execute()
    {
        try
        {
            // Create cube
            GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.name = "RotatingCube";
            cube.transform.position = new Vector3(0, 1, 0);

            // Find script
            MonoScript script = AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/RotatingBoxScript.cs");
            if (script == null) return "Couldn't find RotatingBoxScript.cs";

            Type scriptType = script.GetClass();
            if (scriptType == null || !scriptType.IsSubclassOf(typeof(UdonSharpBehaviour)))
                return "Script must inherit from UdonSharpBehaviour";

            // Get or create program asset
            var programAsset = GetOrCreateProgramAsset(script);
            if (programAsset == null) return "Failed to create UdonSharpProgramAsset";

            // Add components to cube
            UdonSharpBehaviour proxyBehaviour = (UdonSharpBehaviour)cube.AddComponent(scriptType);
            UdonBehaviour udonBehaviour = cube.AddComponent<UdonBehaviour>();
            udonBehaviour.programSource = (AbstractUdonProgramSource)programAsset;

            // Link components
            if (!LinkUdonComponents(proxyBehaviour, udonBehaviour))
                Debug.LogWarning("Component linking may not have succeeded completely");

            Selection.activeGameObject = cube;
            return "Successfully created rotating cube with UdonSharp script";
        }
        catch (Exception e)
        {
            Debug.LogError($"Error: {e.Message}\nInner: {e.InnerException?.Message ?? "none"}");
            return $"Error: {e.Message}\nStackTrace: {e.StackTrace}";
        }
    }

    private static ScriptableObject GetOrCreateProgramAsset(MonoScript script)
    {
        // Try to find existing program asset first
        var programAsset = AssetDatabase.FindAssets("t:Object")
            .Select(guid => AssetDatabase.LoadAssetAtPath<ScriptableObject>(AssetDatabase.GUIDToAssetPath(guid)))
            .Where(asset => asset != null && asset.GetType().Name == "UdonSharpProgramAsset")
            .FirstOrDefault(asset => {
                var field = asset.GetType().GetField("sourceCsScript",
                    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                return field != null && field.GetValue(asset) as MonoScript == script;
            });

        if (programAsset != null) return programAsset;

        // Create new program asset
        Type programAssetType = AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(a => { try { return a.GetTypes(); } catch { return Type.EmptyTypes; } })
            .FirstOrDefault(t => t.Name == "UdonSharpProgramAsset");

        if (programAssetType == null) return null;

        programAsset = ScriptableObject.CreateInstance(programAssetType);
        programAssetType.GetField("sourceCsScript",
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
            ?.SetValue(programAsset, script);

        string assetPath = $"Assets/{script.name}_UdonProgram.asset";
        AssetDatabase.CreateAsset(programAsset, assetPath);
        AssetDatabase.SaveAssets();

        return programAsset;
    }

    private static bool LinkUdonComponents(UdonSharpBehaviour proxyBehaviour, UdonBehaviour udonBehaviour)
    {
        bool success = false;

        // Try to find UdonSharpEditorUtility
        Type utilityType = AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(a => { try { return a.GetTypes(); } catch { return Type.EmptyTypes; } })
            .FirstOrDefault(t => t.Name == "UdonSharpEditorUtility");

        if (utilityType == null) return false;
        
        // Link using UdonSharpEditorUtility
        try
        {
            Debug.Log($"Linking {proxyBehaviour.name} to {udonBehaviour.name}");
            utilityType.GetMethod("SetBackingUdonBehaviour",
                BindingFlags.NonPublic | BindingFlags.Static)
                ?.Invoke(null, new object[] { proxyBehaviour, udonBehaviour });

            Debug.Log($"Running setup for {proxyBehaviour.name} to {udonBehaviour.name}");
            var setupMethod = utilityType.GetMethods(BindingFlags.NonPublic | BindingFlags.Static)
                .FirstOrDefault(m => m.Name == "RunBehaviourSetup" &&
                                    m.GetParameters().Length == 1 &&
                                    m.GetParameters()[0].ParameterType == typeof(UdonSharpBehaviour));

            Debug.Log($"Found setup method: {setupMethod?.Name}");
            setupMethod?.Invoke(null, new object[] { proxyBehaviour });

            Debug.Log($"Copying proxy to Udon: {proxyBehaviour.name} to {udonBehaviour.name}");
            utilityType.GetMethod("CopyProxyToUdon",
                BindingFlags.Public | BindingFlags.Static,
                null, new[] { typeof(UdonSharpBehaviour) }, null)
                ?.Invoke(null, new object[] { proxyBehaviour });

            success = true;
        }
        catch (Exception e)
        {
            Debug.LogWarning($"Error during UdonSharp linking: {e.Message}\nInner: {e.InnerException?.Message ?? "none"}");
        }
        

        return success;
    }
}`;
