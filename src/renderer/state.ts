import { EnvVar, ViewType, SortBy, SortOrder } from './types.js';

export class AppState {
    allEnvVars: EnvVar[] = [];
    filteredVars: EnvVar[] = [];
    protectedVars: Set<string> = new Set();
    revealedVars: Set<string> = new Set();
    selectedVars: Set<string> = new Set();
    groups: Record<string, string[]> = {};
    collapsedGroups: Set<string> = new Set();
    collapsedFolders: Set<string> = new Set();
    selectedFolders: Set<string> = new Set();
    
    sortBy: SortBy = 'name';
    sortOrder: SortOrder = 'asc';
    
    currentView: ViewType = 'folder';
    searchQuery: string = '';
    folderSearchQuery: string = '';
    explorerPath: string[] = [];
    explorerHistory: string[][] = [];
    selectedExplorerVar: string | null = null;

    isAdmin: boolean = false;
    editingVar: EnvVar | null = null;
    clipboard: { type: 'vars' | 'folder', data: any } | null = null;
    
    // UI state
    isDraggingSidebar: boolean = false;
    isDraggingDetails: boolean = false;

    private listeners: (() => void)[] = [];

    subscribe(fn: () => void) {
        this.listeners.push(fn);
    }

    notify() {
        this.listeners.forEach(fn => fn());
    }
}

export const state = new AppState();
