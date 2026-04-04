---
name: System Environment IPC
description: Guidelines for safely interacting with the Windows Registry and Shell profiles
---

# System Environment IPC

When modifying the Windows Environment (Registry or Shell profiles) from a Node.js process, follow these safety protocols to avoid data corruption.

## 1. Safety Patterns for Registry Access (Win32)
- **Use `spawn` over `exec`**: Always use `spawn('reg', ...)` instead of `exec` when dealing with variable values that may contain special shell characters (like `%PATH%`). 
- **The `%` corruption issue**: `exec` invokes the shell (`cmd.exe`), which will automatically expand environment variable placeholders (like `%USERPROFILE%`) before the `reg` command sees them, leading to corrupted data in the registry. `spawn` bypasses the shell expansion entirely.

## 2. Global Environment Refresh Hack
- **The "Setx Hack"**: To force Windows Explorer and other running applications to see registry changes without a system restart/logout:
    - Use `setx __ENV_REFRESH__ ""` and then immediately `reg delete` that temp key.
    - This triggers a `WM_SETTINGCHANGE` broadcast message to all top-level windows, which most modern Windows apps respect.

## 3. Masking & Protection (Export Security)
- **Masking during Export**: When generating PowerShell, Bash, or CMD scripts for export, use the `state.protectedVars` set to decide if a value should be masked (`********`).
- **Secure Previewing**: When previewing a generated script in a web browser:
    - Never pass the script via URL parameters (insecure and size-limited).
    - Use the ephemeral `http.createServer` pattern (`openInBrowserWithLocalServer`) to serve the script locally on a random port, then open the browser pointed to that local address. Shut down the server after a short timeout (e.g., 30s).

## 4. OS-Aware Implementation
- **Value Wrapping**: Use `window.electronAPI.getOsInfo()` to decide on variable wrapping syntax:
    - **Windows**: `%VARIABLE_NAME%`
    - **Unix/Linux/macOS**: `$VARIABLE_NAME`
- **Variable Path Detection**: Use `isPathLike` and `isUrlLike` utilities in the renderer to provide contextual actions like "Open in Explorer" or "Open in Browser," enhancing the "Virtual File System" feel of the manager.
