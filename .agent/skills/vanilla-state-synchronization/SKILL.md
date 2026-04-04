---
name: Vanilla JS State Synchronization
description: Guidelines for managing global application state without a reactive framework
---

# Vanilla JS State Synchronization

The application uses a centralized state pattern to ensure all UI components (Table, Explorer, Toolbar) remain synchronized, achieving React-like reactivity within a standard Vanilla JS / Electron environment.

## 1. The Global State Container (`state.ts`)
- **Centralized Logic**: All configuration settings (view mode, sort orders), variable snapshots, history logs, and transient UI states (selected items, revealed values) reside in the `state` object.
- **Single Source of Truth**: No individual component should store its own private, long-term state. Always pull from and push to `state.ts`.

## 2. The Observer Pattern (Signal/Notify)
- **State Change Handling**: Components modify properties on the global `state` instance. 
- **Notification**: After 1 or more modifications, components **MUST** call `state.notify()`.
    - **Example**: `state.selectedVars.add(name); state.notify();`
- **Subscription**: The `MainRenderer` class (or any "top-level" orchestrator) is the primary subscriber. When `state.notify()` is triggered, it re-executes the global `render()` cycle, causing all synchronized sub-components (like `TableView`) to update.

## 3. Storage Persistence
- **LocalStorage Sync**: The `notify()` flow should optionally trigger a `localStorage.setItem` for key preferences (e.g., `currentView`) to ensure the user's workspace state is restored after application restarts.

## 4. UI Consistency Tips
- **DOM Access**: Always use the `$(id)` helper from `utils.js` for centralized DOM retrieval and error checking.
- **In-Memory Logic**: Perform expensive operations (like filtering and sorting variables) inside the state management flow (e.g., `getFilteredVars()`) instead of inside the loop of a rendering component.
