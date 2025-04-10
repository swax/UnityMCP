using UnityEngine;
using UnityEditor;
using System;
using System.Collections.Generic;
using UnityMCP.Editor;
using Newtonsoft.Json;

/** Used to diagnose why code LLM generates can't run */
public class ScriptTester : EditorWindow
{
    private string scriptCode = "using UnityEngine;\nusing UnityEditor;\nusing System;\nusing System.Collections.Generic;\nusing System.Linq;\n\npublic class EditorCommand\n{\n    public static object Execute()\n    {\n        // Your code here\n        return \"Hello from Script Tester!\";\n    }\n}";
    private Vector2 codeScrollPosition;
    private Vector2 resultScrollPosition;
    private Vector2 logsScrollPosition; // Added scroll position for logs
    private Vector2 mainScrollPosition; // Added scroll position for the entire window
    private string resultText = "";
    private bool hasError = false;
    private List<string> logs = new List<string>();
    private float codeEditorHeight = 400f; // Store the height of the code editor
    private bool isDraggingSplitter = false; // Track if user is dragging the splitter
    
    [MenuItem("UnityMCP/Script Tester")]
    public static void ShowWindow()
    {
        GetWindow<ScriptTester>("Script Tester");
    }
    
    void OnGUI()
    {
        // Begin the main scroll view for the entire window content
        mainScrollPosition = EditorGUILayout.BeginScrollView(mainScrollPosition, GUILayout.ExpandWidth(true), GUILayout.ExpandHeight(true));
        
        EditorGUILayout.Space(5);
        
        EditorGUILayout.LabelField("Enter C# Script:", EditorStyles.boldLabel);
        EditorGUILayout.HelpBox("Your script must contain a class named 'EditorCommand' with a static method 'Execute' that returns an object. Code surrounded by `` will be JSON parsed.", MessageType.Info);
        
        // Code input with syntax highlighting
        EditorGUILayout.BeginVertical(EditorStyles.helpBox);
        codeScrollPosition = EditorGUILayout.BeginScrollView(codeScrollPosition, GUILayout.Height(codeEditorHeight));
        scriptCode = EditorGUILayout.TextArea(scriptCode, GUILayout.ExpandHeight(true));
        EditorGUILayout.EndScrollView();
        EditorGUILayout.EndVertical();
        
        // Draw the splitter
        DrawSplitter(ref codeEditorHeight, 100f, 500f);
        
        EditorGUILayout.Space(10);
        
        // Execute button
        GUI.backgroundColor = new Color(0.7f, 0.9f, 0.7f);
        if (GUILayout.Button("Execute Script", GUILayout.Height(30)))
        {
            ExecuteScript();
        }
        GUI.backgroundColor = Color.white;
        
        EditorGUILayout.Space(10);
        
        // Results area
        EditorGUILayout.LabelField("Results:", EditorStyles.boldLabel);
        
        EditorGUILayout.BeginVertical(EditorStyles.helpBox);
        resultScrollPosition = EditorGUILayout.BeginScrollView(resultScrollPosition, GUILayout.Height(75));
        
        if (hasError)
        {
            EditorGUILayout.HelpBox(resultText, MessageType.Error);
        }
        else if (!string.IsNullOrEmpty(resultText))
        {
            EditorGUILayout.SelectableLabel(resultText, EditorStyles.textField, GUILayout.ExpandHeight(true));
        }
        
        EditorGUILayout.EndScrollView();
        EditorGUILayout.EndVertical();
        
        // Display logs if any
        if (logs.Count > 0)
        {
            EditorGUILayout.Space(10);
            EditorGUILayout.LabelField("Logs:", EditorStyles.boldLabel);
            
            foreach (var log in logs)
            {
                EditorGUILayout.HelpBox(log, MessageType.Info);
            }
        }
        
        // End the main scroll view
        EditorGUILayout.EndScrollView();
    }
    
    private void ExecuteScript()
    {
        logs.Clear();
        hasError = false;
        resultText = "Executing script...";
        
        // Force immediate UI update before execution
        Repaint();
        
        // Use delayCall instead of update to ensure UI has time to refresh
        // delayCall happens after all inspector redraws are complete
        EditorApplication.delayCall += ExecuteAfterRepaint;
    }
    
    private void ExecuteAfterRepaint()
    {
        // Remove the callback
        EditorApplication.delayCall -= ExecuteAfterRepaint;
        
        // Collect logs during execution
        Application.logMessageReceived += LogHandler;
        
        try
        {
            // Process the code if it appears to be from JSON
            string processedCode = scriptCode;
            if (scriptCode.StartsWith("`"))
            {
                processedCode = ProcessJsonStringCode(scriptCode);
            }
            
            // Execute the code using CSEditorHelper
            var result = UnityMCP.Editor.EditorCommandExecutor.CompileAndExecute(processedCode);
            
            // Format the result
            if (result != null)
            {
                resultText = "Result: " + result.ToString();
            }
            else
            {
                resultText = "Result: null";
            }
        }
        catch (Exception e)
        {
            hasError = true;
            resultText = $"Error: {e.Message}\n\nStack Trace:\n{e.StackTrace}";
        }
        finally
        {
            Application.logMessageReceived -= LogHandler;
        }
        
        Repaint();
    }
    
    // Process code string that might be from JSON with backticks
    private string ProcessJsonStringCode(string input)
    {
        if (string.IsNullOrEmpty(input))
            return input;
            
        try
        {
            // Remove backticks if present
            if (input.StartsWith("`"))
                input = input.Trim('`');
            
            // Sanitize input by joining lines that end with a comma and backslash
            string[] lines = input.Split(new[] { '\n', '\r' }, StringSplitOptions.None);
            List<string> sanitizedLines = new List<string>();
            
            for (int i = 0; i < lines.Length; i++)
            {
                string currentLine = lines[i];
                
                // Check if the current line ends with a comma and backslash
                while (i < lines.Length - 1 && currentLine.TrimEnd().EndsWith("\\"))
                {
                    // Remove the trailing backslash and join with the next line
                    currentLine = currentLine.TrimEnd().TrimEnd('\\') + lines[i + 1].TrimStart();
                    i++; // Skip the next line since we've joined it
                }
                
                sanitizedLines.Add(currentLine);
            }
            
            // Join the sanitized lines back together
            input = string.Join("\n", sanitizedLines);
                
            string unescaped = JsonConvert.DeserializeObject<string>('"' + input + '"');
            return unescaped;
        }
        catch (JsonException ex)
        {
            // Log the error but return the original input to avoid blocking execution
            Debug.LogWarning($"Failed to parse as JSON string: {ex.Message}");
            return input;
        }
    }
    
    private void LogHandler(string message, string stackTrace, LogType type)
    {
        if (type == LogType.Log)
        {
            logs.Add(message);
        }
        else if (type == LogType.Warning)
        {
            logs.Add($"Warning: {message}");
        }
        else if (type == LogType.Error || type == LogType.Exception)
        {
            logs.Add($"Error: {message}\n{stackTrace}");
        }
    }
    
    // Draw a splitter that can be dragged to resize the element above it
    private void DrawSplitter(ref float heightToAdjust, float minHeight, float maxHeight)
    {
        EditorGUILayout.Space(2);
        
        // Draw the splitter handle
        Rect splitterRect = EditorGUILayout.GetControlRect(false, 5f);
        EditorGUI.DrawRect(splitterRect, new Color(0.5f, 0.5f, 0.5f, 0.5f));
        
        // Change cursor when hovering over the splitter
        EditorGUIUtility.AddCursorRect(splitterRect, MouseCursor.ResizeVertical);
        
        // Handle splitter dragging
        Event e = Event.current;
        switch (e.type)
        {
            case EventType.MouseDown:
                if (splitterRect.Contains(e.mousePosition))
                {
                    isDraggingSplitter = true;
                    e.Use();
                }
                break;
                
            case EventType.MouseDrag:
                if (isDraggingSplitter)
                {
                    heightToAdjust += e.delta.y;
                    heightToAdjust = Mathf.Clamp(heightToAdjust, minHeight, maxHeight);
                    e.Use();
                    Repaint();
                }
                break;
                
            case EventType.MouseUp:
                if (isDraggingSplitter)
                {
                    isDraggingSplitter = false;
                    e.Use();
                }
                break;
        }
        
        EditorGUILayout.Space(2);
    }
}