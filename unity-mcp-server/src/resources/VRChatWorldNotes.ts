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

## Unity UdonSharp Editor Integration Reference

Namespace and Assembly References
- Include using VRC.Udon.Common.Interfaces; when working with UdonBehaviour
- Include using UnityEditor.SceneManagement; for EditorSceneManager
- Include using VRC.Udon; for core Udon types
- Avoid direct use of UdonSharpEditorUtility from editor commands

Asset Loading and Creation
- Use AssetDatabase.LoadAssetAtPath<>() for reliable asset loading
- Check if assets exist before creating new ones
- Use explicit asset paths like "Assets/MyScript_UdonProgram.asset"
- Split asset creation and component wiring into separate operations

UdonBehaviour Programming
- Cast program sources to AbstractUdonProgramSource instead of interfaces
- Direct assignment of programSource works better than complex type manipulation
- Avoid creating UdonVariable<T> objects directly
- Don't attempt to call complex methods like ApplyPropertiesSettings

Reflection-Based Approaches
- Use reflection to find and set fields when direct API calls fail
- Access UdonBehaviour variables through reflection:
  - Get programs field with reflection (BindingFlags.NonPublic | BindingFlags.Instance)
  - Navigate to publicVariables field through reflection
- For UdonSharpProgramAssets, use reflection to:
  - Find the UdonSharpProgramAsset type
  - Access and set the sourceCsScript field
  - Create and save the asset properly

Workflow Best Practices
- Perform operations in stages: create assets → assign program sources → set fields → link components
- Use thorough error handling with full stack traces to identify API issues
- Avoid complex serialization or object manipulation
- Avoid trying to generate paths dynamically

If you'd like to revise these notes. Alert the user and ask them to update the notes.

## Rendering text

In Udon you can't use the legacy Unity TextMesh (or UI.Text) component directly because 
many of its methods and properties aren't exposed to Udon. Instead, you'll need to use 
a TextMeshPro-based component that is supported by VRChat's Udon.

If TextMeshPro is not installed, you can install it via the Unity Package Manager or prompt th user to do so.

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
}
    
# VRChat Components Reference

Further documenation can be found here https://creators.vrchat.com/worlds/components/
If you're not sure, look it up first to avoid compile errors. 

## Udon (VRC.Udon)
- **UdonBehaviour**
  - Properties: programSource, publicVariables, DisableInteractive, InteractionText, SyncMethod
  - Methods: SetProgramVariable(), GetProgramVariable<T>(), SendCustomEvent(), SendCustomNetworkEvent()

- **UdonManager**
  - Properties: DebugLogging, HasLoaded
  - Methods: GetUdonBehavioursInScene(), SetUdonEnabled()

## SDK3 Components (VRC.SDK3.Components)
- **VRCObjectSync**
  - Properties: AllowCollisionOwnershipTransfer
  - Methods: FlagDiscontinuity(), Respawn(), SetKinematic(), SetGravity(), TeleportTo()

- **VRCPickup**
  - Methods: Drop(), GenerateHapticEvent()

- **VRCStation**
  - Properties: disableStationExit, canUseStationFromStation
  - Events: OnLocalPlayerEnterStation, OnLocalPlayerExitStation

- **VRCMirrorReflection**
  - Properties: cameraClearFlags, customClearColor, customSkybox

- **VRCObjectPool**
  - Properties: Pool
  - Methods: TryToSpawn(), Return(), Shuffle()

- **VRCAvatarPedestal**
  - Methods: SwitchAvatar()

- **VRCSceneDescriptor**
  - Properties: PlayerPersistence, NavigationAreas

- **VRCPortalMarker**

- **VRCUiShape**

- **VRCSpatialAudioSource**

## Video Components (VRC.SDK3.Video.Components)
- **VRCUnityVideoPlayer**
  - Properties: IsPlaying, IsReady, Loop
  - Methods: PlayURL(), LoadURL(), Play(), Pause(), Stop(), GetTime(), SetTime()

- **VRCAVProVideoPlayer** (VRC.SDK3.Video.Components.AVPro)
  - Properties: AutoPlay, Loop, MaximumResolution, UseLowLatency
  - Methods: PlayURL(), LoadURL(), Play(), Pause(), Stop(), GetTime(), SetTime()

- **VRCAVProVideoScreen** (VRC.SDK3.Video.Components.AVPro)
  - Properties: VideoPlayer, MaterialIndex, TextureProperty, UseSharedMaterial

- **VRCAVProVideoSpeaker** (VRC.SDK3.Video.Components.AVPro)
  - Properties: VideoPlayer, Mode

## Dynamics Components (VRC.Dynamics)
- **ContactReceiver**
  - Properties: parameter, receiverType, allowSelf, allowOthers, minVelocity
  - Methods: IsColliding()

- **ContactSender**
  - Properties: radius

- **PhysBoneManager**
  - Methods: GetChains(), GetGrabs()

## PhysBone Components (VRC.SDK3.Dynamics.PhysBone.Components)
- **VRCPhysBone**
  - Properties: rootTransform, endpointPosition, pull, spring, immobileType

- **VRCPhysBoneCollider**
  - Properties: radius, height, boundingBox, shapeType

## Constraint Components (VRC.SDK3.Dynamics.Constraint.Components)
- **VRCAimConstraint**
  - Properties: AffectsRotationX/Y/Z, AimAxis, UpAxis

- **VRCLookAtConstraint**
  - Properties: Roll, UseUpTransform

- **VRCParentConstraint**
  - Properties: AffectsPositionX/Y/Z, AffectsRotationX/Y/Z

- **VRCPositionConstraint**
  - Properties: AffectsPositionX/Y/Z, PositionOffset

- **VRCRotationConstraint**
  - Properties: AffectsRotationX/Y/Z, RotationOffset

- **VRCScaleConstraint**
  - Properties: AffectsScaleX/Y/Z, ScaleOffset

## Midi Components (VRC.SDK3.Midi)
- **VRCMidiPlayer**
  - Properties: midiFile, audioSource
  - Methods: Play(), Stop()

- **VRCMidiListener**
  - Properties: activeEvents

## SDK Base (VRC.SDKBase)
- **VRC_EventHandler**
  - Methods: TriggerEvent(), IsReadyForEvents()

- **VRCCustomAction**
  - Methods: Execute()
`;
