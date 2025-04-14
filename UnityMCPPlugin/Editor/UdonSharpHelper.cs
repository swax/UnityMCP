using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using System.IO;
using System;
using UnityEditor.Compilation;

namespace UnityMCP.VRChatUtils
{
    public static class UdonSharpHelper
    {
        /// <summary>
        /// Creates a UdonSharp asset file for a given C# script
        /// There isn't an easy way I've found to do this programmatically so this method does it by manually creating an asset file
        /// </summary>
        /// <param name="scriptPath">Path to the cs file relative to the Assets folder</param>
        /// <returns>Path to the created asset file</returns>
        public static string CreateAsset(string scriptPath)
        {
            // Validate script path
            if (string.IsNullOrEmpty(scriptPath) || !scriptPath.EndsWith(".cs"))
            {
                ThrowAndLog("Invalid script path: " + scriptPath);
            }

            // Get the script GUID
            string scriptGuid = AssetDatabase.AssetPathToGUID(scriptPath);
            if (string.IsNullOrEmpty(scriptGuid))
            {
                ThrowAndLog("Could not find GUID for script at path: " + scriptPath);
            }

            // Verify UdonSharp program asset GUID
            string udonSharpProgramAssetGuid = GetUdonSharpProgramAssetGuid();
            if (string.IsNullOrEmpty(udonSharpProgramAssetGuid))
            {
                ThrowAndLog("UdonSharpProgramAsset GUID not found. Please ensure UdonSharp is installed correctly.");
            }

            // Determine the asset name and path
            string scriptName = Path.GetFileNameWithoutExtension(scriptPath);
            string assetName = scriptName;
            string scriptDirectory = Path.GetDirectoryName(scriptPath);
            string assetPath = Path.Combine(scriptDirectory, assetName + ".asset");

            // Create the asset data
            var assetData = $@"%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {{fileID: 0}}
  m_PrefabInstance: {{fileID: 0}}
  m_PrefabAsset: {{fileID: 0}}
  m_GameObject: {{fileID: 0}}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {{fileID: 11500000, guid: {udonSharpProgramAssetGuid}, type: 3}}
  m_Name: {assetName}
  m_EditorClassIdentifier: 
  sourceCsScript: {{fileID: 11500000, guid: {scriptGuid}, type: 3}}
  behaviourSyncMode: 0
  behaviourIDHeapVarName: 
  variableNames: []
  variableValues: []";

            // Write the asset file
            File.WriteAllText(assetPath, assetData);
            Debug.Log($"Created UdonSharp asset at: {assetPath}");

            // Refresh the AssetDatabase to detect the new file
            AssetDatabase.Refresh();

            // Request a full script compilation
            CompilationPipeline.RequestScriptCompilation();

            // Return the path to the created asset
            return assetPath;
        }

        /// <summary>
        /// Attempts to find the GUID of the UdonSharpProgramAsset script in the project
        /// </summary>
        /// <returns>GUID of the UdonSharpProgramAsset script or empty string if not found</returns>
        private static string GetUdonSharpProgramAssetGuid()
        {
            // Try to find UdonSharpProgramAsset.cs by name
            string[] guids = AssetDatabase.FindAssets("UdonSharpProgramAsset t:MonoScript");
            foreach (string guid in guids)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (path.Contains("UdonSharpProgramAsset.cs"))
                {
                    return guid;
                }
            }

            return string.Empty;
        }

        private static void ThrowAndLog(string message)
        {
            Debug.LogError(message);
            throw new Exception(message);
        }
    }
}