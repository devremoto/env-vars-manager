---
name: Export Handling Strategy
description: Guidelines for format-specific export actions (Browser vs Editor)
---

# Export Handling Strategy

The application provides different export actions (Save, Open in Editor, Open in Browser) based on the file format to ensure the best possible viewing and editing experience.

## 1. Format-Specific Defaults
To provide a seamless, "one-click" experience, the application bypasses the standard Electron "Save As" dialog for formats that are primarily intended for immediate viewing or editing.

| Format | Default Action | UX Pattern |
| :--- | :--- | :--- |
| **HTML** | **Browser** | Skips save dialog; saves to `tmpdir`, and opens in system browser via `shell.openExternal`. |
| **PDF** | **Browser** | Skips save dialog; saves to `tmpdir`, and opens in system browser via `shell.openExternal`. |
| **JSON** | **Browser** | Skips save dialog; serves via local HTTP server or temporary file for browser consumption. |
| **DOCX** | **Editor** | Skips save dialog; saves to `tmpdir`, and opens in default document editor (e.g. Word) via `shell.openPath`. |

## 2. Implementation Logic
- **Renderer (`MainRenderer.ts`)**: When the user selects a format from the `ExportDropdown`, detect if it is a view-centric format and pass `'browser'` or `'editor'` as the `action` parameter to the `exportEnvVars` IPC call.
- **Main Process (`main.ts`)**:
    - If `action === 'save'`, ALWAYS show the `dialog.showSaveDialog`.
    - If `action === 'browser'` or `action === 'editor'`, ALWAYS skip the dialog and generate a temporary `filePath` using `os.tmpdir()` and a timestamp.
    - After saving the file, use `shell.openExternal` for browsers (native rendering) and `shell.openPath` for editors.

## 3. Masking & Protection
- Always respect the `isMasked` flag during export to hide sensitive data marked as protected.
- For scripts, utilize the `.agent/skills/protect-sensitive-vars` rules to automatically suggest protection for key/secret patterns.

## 4. Temporary File Management
- Files generated for "Open in Editor/Browser" should be stored in the system's temporary directory (`os.tmpdir()`) with unique timestamps to prevent collision and ensure cleanup upon OS reboot.
