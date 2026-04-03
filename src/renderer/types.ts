export interface ElectronAPI {
    getOsInfo: () => Promise<OsInfo>;
    getEnvVars: () => Promise<EnvVar[]>;
    createEnvVar: (name: string, value: string, isSystem?: boolean, isProtected?: boolean) => Promise<{ success: boolean; error?: string }>;
    updateEnvVar: (name: string, value: string, oldName?: string, isSystem?: boolean) => Promise<{ success: boolean; error?: string }>;
    deleteEnvVar: (name: string, isSystem?: boolean) => Promise<{ success: boolean; error?: string }>;
    exportEnvVars: (vars: any[], format: string, isMasked: boolean, mode?: string, extraParam?: string, action?: string, excludeProtected?: boolean, maskBlank?: boolean) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    importEnvVars: () => Promise<{ success: boolean; vars?: EnvVar[]; error?: string }>;
    getProtectedVars: () => Promise<string[]>;
    toggleProtectedVar: (name: string) => Promise<{ success: boolean; isProtected: boolean; error?: string }>;
    protectVars: (names: string[], protect: boolean) => Promise<{ success: boolean; error?: string }>;
    getGroups: () => Promise<Record<string, string[]>>;
    saveGroups: (groups: Record<string, string[]>) => Promise<{ success: boolean; error?: string }>;
    getEnvironments: () => Promise<string[]>;
    saveEnvironments: (envs: string[]) => Promise<{ success: boolean; error?: string }>;
    resetApp: () => Promise<{ success: boolean; error?: string }>;
    openUrl: (url: string) => Promise<void>;
    openPath: (path: string) => Promise<void>;
    showItemInFolder: (path: string) => Promise<void>;
    openCmd: (name: string) => Promise<{ success: boolean; error?: string }>;
    windowMinimize: () => void;
    windowMaximize: () => void;
    windowClose: () => void;
    checkIsAdmin: () => Promise<boolean>;
    optimizeVar: (name: string, value: string) => Promise<{ original: string; optimized: string; savings: number }>;
    getVarHistory: (name?: string) => Promise<any[]>;
    restoreVar: (historyId: string) => Promise<{ success: boolean; error?: string }>;
    deleteHistory: (ids: string[]) => Promise<{ success: boolean; error?: string }>;
    getOsVars: () => Promise<Record<string, string>>;
}

export interface OsInfo {
    type: string;
    platform: string;
    release: string;
    arch: string;
    hostname: string;
    homeDir: string;
    totalMem: string;
    cpus: number;
    uptime: string;
}

export interface EnvVar {
    name: string;
    value: string;
    isSystem?: boolean;
    isProtected?: boolean;
    groupName?: string;
    canOptimize?: boolean;
    _isSensitive?: boolean;
}

export type ViewType = 'list' | 'folder';
export type SortBy = 'name' | 'value' | 'protected';
export type SortOrder = 'asc' | 'desc';

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
