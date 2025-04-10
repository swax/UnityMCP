import { Resource, ResourceContext, ResourceDefinition } from "./types.js";

export class UdonScriptExample implements Resource {
  getDefinition(): ResourceDefinition {
    return {
      uri: "help:///vrchat/udon-script-example",
      name: "UdonScriptExample",
      mimeType: "text/plain",
      description:
        "Example of creating and attaching an UdonSharp script to a GameObject in Unity.",
    };
  }

  async getContents(context: ResourceContext): Promise<string> {
    return creatingAndAttachingUdonScriptExample;
  }
}

const creatingAndAttachingUdonScriptExample = `using UnityEngine;
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
