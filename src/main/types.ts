export interface EnvVar {
    name: string;
    value: string;
    isSystem?: boolean;
    canOptimize?: boolean;
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
