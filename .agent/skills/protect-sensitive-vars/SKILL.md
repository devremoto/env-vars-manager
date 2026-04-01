---
name: Protect Sensitive Vars
description: Guidelines for protecting sensitive variables during import and creation
---

# Protecting Sensitive Environment Variables

When importing or creating environment variables for this application, it is critical to adhere to the established protection rules to secure sensitive information like API keys, secrets, passwords, and tokens.

## Rules

Always enforce protection on variables if their name contains any of the following substrings (case-insensitive):
- `KEY`
- `SECRET`
- `PASS`
- `TOKEN`
- `AUTH`
- `CLIENTID`
- `CLIENT_ID`

If a variable matches these patterns, it **MUST** be saved as a protected variable. This ensures the value is masked (`********`) in the UI by default and prevents accidental exposure.

## Implementation Details
In `src/renderer/renderer.ts`, the constant `SENSITIVE_KEYWORDS` should be used as the single source of truth for these rules.

```typescript
const SENSITIVE_KEYWORDS = ['KEY', 'SECRET', 'PASS', 'TOKEN', 'AUTH', 'CLIENTID', 'CLIENT_ID'];
```

When new variables are parsed, imported, or created, always check against this array:
```typescript
const isSensitive = SENSITIVE_KEYWORDS.some(s => varName.toUpperCase().includes(s));
if (isSensitive) {
    // apply protection logic
    await window.electronAPI.protectVars([varName], true);
}
```
