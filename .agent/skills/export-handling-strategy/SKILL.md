---
name: Export Handling Strategy
description: Guidelines for format-specific export actions (Browser vs Editor)
---

# Export Handling Strategy

The application provides different export actions (Save, Open in Editor, Open in Browser) based on the file format to ensure the best possible viewing and editing experience.

## 1. Format-Specific Defaults
Even if a user selects a generic action, the application enforces format-specific overrides:

| Format | Preferred Action | Rationale |
| :--- | :--- | :--- |
| **HTML** | **Browser** | Browsers provide native rendering and consistent styling. |
| **PDF** | **Browser** | Modern browsers have excellent built-in PDF viewers; prevents issues with missing standalone readers. |
| **DOCX** | **Editor** | Browsers do not natively render Word documents; forcing the editor (like Word/LibreOffice) ensures the file is readable and editable. |
| **Scripts** | **Browser (Preview)** | For ephemeral previews, scripts are served via a local HTTP server to the browser to avoid security/size limits of URL parameters. |

## 2. Implementation in `main.ts`
When handling an export IPC call, always calculate the `actualAction`:
```typescript
// Example for HTML/PDF
const actualAction = (finalAction === 'editor' || finalAction === 'browser') ? 'browser' : 'save';

if (actualAction === 'browser') {
    // Open in browser
} else {
    // Save only
}
```

## 3. Masking & Protection
- Always respect the `isMasked` flag during export to hide sensitive data marked as protected.
- For scripts, utilize the `.agent/skills/protect-sensitive-vars` rules to automatically suggest protection for key/secret patterns.

## 4. Temporary File Management
- Files generated for "Open in Editor/Browser" should be stored in the system's temporary directory (`os.tmpdir()`) with unique timestamps to prevent collision and ensure cleanup upon OS reboot.
