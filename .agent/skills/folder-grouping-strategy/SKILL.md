---
name: Folder & Grouping Strategy
description: Guidelines for managing the naming-based virtual file system vs arbitrary user groups
---

# Folder & Grouping Strategy

The application differentiates between naming-based hierarchy ("Folders") and user-defined sets ("Groups"). Understanding this distinction is critical for consistent variable organization.

## 1. Naming-Based "Folders" (Virtual File System)
- **Convention**: Use a double underscore (`__`) or similar delimiter in variable names (e.g., `APP__PROD__KEY`) to automatically derive a visual folder hierarchy.
- **Rendering**: In "Folder View," use `splitVarName(v.name).join('/')` to transform flat variables into a nested tree.
- **Naming Rule**: Advise users to use prefixing for logical organization (e.g., `OS__`, `DEV__`) to maintain a clean "Virtual File System" without extra metadata.

## 2. Arbitrary "Groups"
- **Definition**: Groups are persistent, user-defined collections of variables that don't need a naming convention. They are stored in `groups.json`.
- **Association**: A variable can only belong to one group at a time. Changing its group updates the `groups.json` mapping.
- **Rendering**: In "Group View," variables are aggregated by their group name in the table grid.

## 3. Best Practices
- **Folder nesting**: Do not encourage nesting deeper than 3-4 levels via naming as this can clutter the "Folder View" grid.
- **Group names**: Group names should be concise and purpose-driven (e.g., "Deployment", "Sensitive", "History").
- **Synchronization**: Whenever a variable's group changes, the `state.notify()` method must be called to refresh both the folder tree and the grid. 
