using UnityEngine;
using UnityEditor;
using System;

namespace UnityMCP.Editor
{
    public static class EditorUtilities
    {
        /// <summary>
        /// Waits for Unity to finish any ongoing compilation or asset processing
        /// </summary>
        /// <param name="timeoutSeconds">Maximum time to wait in seconds (0 means no timeout)</param>
        /// <returns>True if compilation finished, false if timed out</returns>
        public static bool WaitForUnityCompilation(float timeoutSeconds = 30f)
        {
            if (!EditorApplication.isCompiling)
                return true;

            Debug.Log("[UnityMCP] Waiting for Unity to finish compilation...");

            float startTime = Time.realtimeSinceStartup;
            bool complete = false;

            // Set up a waiter using EditorApplication.update
            EditorApplication.CallbackFunction waiter = null;
            waiter = () =>
            {
                // Check if Unity finished compiling
                if (!EditorApplication.isCompiling)
                {
                    EditorApplication.update -= waiter;
                    complete = true;
                    Debug.Log("[UnityMCP] Unity compilation completed");
                }
                // Check for timeout if specified
                else if (timeoutSeconds > 0 && (Time.realtimeSinceStartup - startTime) > timeoutSeconds)
                {
                    EditorApplication.update -= waiter;
                    Debug.LogWarning($"[UnityMCP] Timed out waiting for Unity compilation after {timeoutSeconds} seconds");
                }
            };

            EditorApplication.update += waiter;

            // Force a synchronous wait since we're in an editor command context
            while (!complete && (timeoutSeconds <= 0 || (Time.realtimeSinceStartup - startTime) <= timeoutSeconds))
            {
                System.Threading.Thread.Sleep(100);
                // Process events to keep the editor responsive
                if (EditorWindow.focusedWindow != null)
                {
                    EditorWindow.focusedWindow.Repaint();
                }
            }

            // Force a small delay to ensure any final processing is complete
            System.Threading.Thread.Sleep(500);

            return complete;
        }
    }
}
