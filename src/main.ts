/* eslint-disable @typescript-eslint/no-var-requires */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const url = require('url');
const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const { initDB, upsertVariable, deleteVariable, getHistory, getHistoryById, getAllVariables, logHistory, getVariableByName } = require('./db');
const { optimizeValue } = require('./optimizer');

try {
    require('electron-reloader')(module, {
        debug: true,
        watchRenderer: true,
        ignore: [/main\.js$/, /protected-vars\.json$/]
    });
} catch (err) {
    console.error('electron-reloader error:', err);
}

const execAsync = promisify(exec);

// Path to store protected variables data
let protectedVarsPath = '';
let environmentsPath = '';
let groupsPath = '';

interface EnvVar {
    name: string;
    value: string;
    isSystem?: boolean;
    canOptimize?: boolean;
}

function openInBrowserWithLocalServer(content: string, contentType: string, filename: string) {
    const server = http.createServer((_req: any, res: any) => {
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${filename}"`,
            'Access-Control-Allow-Origin': '*'
        });
        res.end(content);
        // We'll close later via timeout to ensure the browser has time to finish initial reads
    });

    server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        const port = addr?.port;
        if (port) {
            shell.openExternal(`http://127.0.0.1:${port}/${filename}`);
        }
    });

    // Auto-shutdown after 30 seconds to clean up
    setTimeout(() => {
        try { server.close(); } catch (e) { /* ignore */ }
    }, 30000);
}

interface OsInfo {
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

let mainWindow: any = null;

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Environment Variables Manager',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0a0a1a',
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Initialize file paths before app binds
app.on('ready', () => {
    protectedVarsPath = path.join(app.getPath('userData'), 'protected-vars.json');
    if (!fs.existsSync(protectedVarsPath)) {
        fs.writeFileSync(protectedVarsPath, JSON.stringify([]), 'utf-8');
    }

    groupsPath = path.join(app.getPath('userData'), 'groups.json');
    if (!fs.existsSync(groupsPath)) {
        fs.writeFileSync(groupsPath, JSON.stringify({}), 'utf-8');
    }

    environmentsPath = path.join(app.getPath('userData'), 'environments.json');
    if (!fs.existsSync(environmentsPath)) {
        fs.writeFileSync(environmentsPath, JSON.stringify(['Development', 'Staging', 'Production']), 'utf-8');
    }
});

app.whenReady().then(async () => {
    await initDB();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Window controls
ipcMain.handle('window-minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.handle('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }
});
ipcMain.handle('window-close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.handle('open-url', (_event, url: string) => shell.openExternal(url));

function expandEnvVars(pathStr: string): string {
    if (!pathStr) return pathStr;
    const platform = os.platform();
    if (platform === 'win32') {
        return pathStr.replace(/%([^%]+)%/g, (_, name) => {
            return process.env[name] || process.env[name.toUpperCase()] || `%${name}%`;
        });
    } else {
        let expanded = pathStr.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
            return process.env[name] || `$${name}`;
        });
        expanded = expanded.replace(/\$\{([^}]+)\}/g, (_, name) => {
            return process.env[name] || `\${${name}}`;
        });
        return expanded;
    }
}

ipcMain.handle('open-path', (_event, rawPath: string) => {
    const expanded = expandEnvVars(rawPath);
    return shell.openPath(expanded);
});

ipcMain.handle('show-item-in-folder', (_event, rawPath: string) => {
    const expanded = expandEnvVars(rawPath);
    return shell.showItemInFolder(expanded);
});

// Open CMD
ipcMain.handle('open-cmd', async (event, varName: string) => {
    try {
        const isWin = process.platform === 'win32';
        if (isWin) {
            // Spawn a new cmd window, show variable name literals (with % %) and its value clearly
            // Use /c so the window closes after timeout finishes
            const varSyntax = `%${varName}%`;
            require('child_process').spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/c', `echo Variable: ^%${varName}^% & echo Value: ${varSyntax} & timeout /t 10`], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        } else {
            // macOS/Linux basic fallback
            // Remove 'exec bash' so the shell exits after sleep
            const varSyntax = `$${varName}`;
            require('child_process').spawn('sh', ['-c', `x-terminal-emulator -e "bash -c 'echo \"Variable: \\$${varName}\"; echo \"Value: ${varSyntax}\"; sleep 10'" || gnome-terminal -- bash -c "echo \"Variable: \\$${varName}\"; echo \"Value: ${varSyntax}\"; sleep 10" || xterm -e "bash -c 'echo \"Variable: \\$${varName}\"; echo \"Value: ${varSyntax}\"; sleep 10'"`], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// OS Info
ipcMain.handle('check-is-admin', async (): Promise<boolean> => {
    if (os.platform() !== 'win32') {
        return process.getuid ? process.getuid() === 0 : false;
    }
    try {
        await execAsync('net session');
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('get-os-info', (): OsInfo => {
    const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
    const uptimeHours = (os.uptime() / 3600).toFixed(1);

    let osName = os.type();
    if (osName === 'Windows_NT') osName = 'Windows';
    else if (osName === 'Darwin') osName = 'macOS';

    return {
        type: osName,
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        homeDir: os.homedir(),
        totalMem: `${totalMemGB} GB`,
        cpus: os.cpus().length,
        uptime: `${uptimeHours} hours`,
    };
});

ipcMain.handle('get-os-vars', async () => {
    try {
        const standardKeys = [
            'ALLUSERSPROFILE', 'APPDATA', 'COMPUTERNAME', 'COMSPEC', 'CommonProgramFiles',
            'CommonProgramFiles(x86)', 'CommonProgramW6432', 'DriverData', 'HOMEDRIVE',
            'HOMEPATH', 'LOCALAPPDATA', 'LOGONSERVER', 'NUMBER_OF_PROCESSORS', 'OS',
            'PATH', 'PATHEXT', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER',
            'PROCESSOR_LEVEL', 'PROCESSOR_REVISION', 'ProgramData', 'ProgramFiles',
            'ProgramFiles(x86)', 'ProgramW6432', 'PUBLIC', 'SESSIONNAME', 'SystemDrive',
            'SystemRoot', 'TEMP', 'TMP', 'USERDOMAIN', 'USERDOMAIN_ROAMINGPROFILE',
            'USERNAME', 'USERPROFILE', 'windir'
        ];

        const standardVars: Record<string, string> = {};
        standardKeys.forEach(key => {
            const val = process.env[key] || process.env[key.toUpperCase()];
            if (val) standardVars[key] = val;
        });

        // ONLY return the Standard ones. No noise.
        return {
            "Predefined OS Variables": standardVars
        };
    } catch (err) {
        console.error('Error fetching filtered OS variables:', err);
        return { "OS Variables": {} }; 
    }
});

// Get environment variables
ipcMain.handle('get-env-vars', async (): Promise<EnvVar[]> => {
    try {
        console.log('Loading environment variables (IPC)...');
        
        // 1. Get current process snapshot as base
        const processVarsMap = new Map<string, string>();
        Object.entries(process.env).forEach(([k, v]) => {
            if (v !== undefined) processVarsMap.set(k, v);
        });

        // 2. Fetch all variables from Database (The primary source of truth for managed vars)
        const dbVars = await getAllVariables();
        
        // Combine them into a definitive list
        const combined = new Map<string, EnvVar>();
        
        // Start with process vars (default to non-system as we don't know for sure here)
        processVarsMap.forEach((value, name) => {
            combined.set(name, { name, value, isSystem: false });
        });

        // Override with DB vars (which have correct scope/value precision)
        dbVars.forEach((dv: any) => {
            combined.set(dv.name, { 
                name: dv.name, 
                value: dv.value, 
                isSystem: dv.scope === 'system' 
            });
        });

        const list = Array.from(combined.values()).sort((a, b) => a.name.localeCompare(b.name));
        const envContext = process.env as Record<string, string>;

        // 3. Apply canOptimize flag (using the result from optimizer)
        return list.map(v => {
            try {
                const result = optimizeValue(v.name, v.value, envContext);
                return {
                    ...v,
                    canOptimize: result.lengthReduced > 0
                };
            } catch (e) {
                return { ...v, canOptimize: false };
            }
        });
    } catch (err: any) {
        console.error('CRITICAL: Error loading variables:', err);
        return [];
    }
});

function parseRegistryOutputToEnvVars(output: string, isSystem: boolean): EnvVar[] {
    if (!output) return [];
    const vars: EnvVar[] = [];
    const lines = output.split(/\r?\n/).filter((line: string) => line.trim());

    for (const line of lines) {
        // Match name, type, and value. Value can be empty.
        const match = line.match(/^\s+(\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/);
        if (match) {
            vars.push({ name: match[1], value: match[2] || '', isSystem });
        }
    }
    return vars;
}

function parseRegistryOutputToRecord(output: string): Record<string, string> {
    const vars: Record<string, string> = {};
    const lines = output.split(/\r?\n/).filter((line: string) => line.trim());

    for (const line of lines) {
        const match = line.match(/^\s+(\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/);
        if (match) {
            vars[match[1].toUpperCase()] = match[2];
        }
    }
    return vars;
}

function parseRegistryOutput(output: string): EnvVar[] {
    const vars: EnvVar[] = [];
    const lines = output.split(/\r?\n/).filter((line: string) => line.trim());

    for (const line of lines) {
        const match = line.match(/^\s+(\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/);
        if (match) {
            vars.push({ name: match[1], value: match[2] });
        }
    }

    return vars.sort((a: EnvVar, b: EnvVar) => a.name.localeCompare(b.name));
}

function processEnvToArray(): EnvVar[] {
    return Object.entries(process.env)
        .filter(([, value]: [string, string | undefined]) => value !== undefined)
        .map(([name, value]: [string, string | undefined]) => ({ name, value: value as string, isSystem: false }))
        .sort((a: EnvVar, b: EnvVar) => a.name.localeCompare(b.name));
}

const { spawn } = require('child_process');

async function setRegistryValue(name: string, value: string, isSystem: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
        const targetKey = isSystem ? 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\Environment' : 'HKCU\\Environment';
        const type = value.includes('%') ? 'REG_EXPAND_SZ' : 'REG_SZ';
        
        // Use spawn to avoid shell expansion of %VAR% in the value itself
        const reg = spawn('reg', ['add', targetKey, '/v', name, '/t', type, '/d', value, '/f']);
        
        let errorData = '';
        reg.stderr.on('data', (data: any) => errorData += data.toString());
        
        reg.on('close', async (code: number) => {
            if (code === 0) {
                // Trigger refresh using the setx hack
                if (!isSystem) {
                    try {
                        await execAsync('setx __ENV_REFRESH__ "" && reg delete "HKCU\\Environment" /v __ENV_REFRESH__ /f 2>nul');
                    } catch (e) {}
                }
                resolve();
            } else {
                reject(new Error(`reg add failed with code ${code}: ${errorData}`));
            }
        });
    });
}

// Create environment variable
ipcMain.handle('create-env-var', async (_event: any, name: string, value: string, isSystem: boolean = false, isProtected: boolean = false): Promise<{ success: boolean; error?: string }> => {
    const platform = os.platform();

    try {
        if (platform === 'win32') {
            await setRegistryValue(name, value, isSystem);
        } else {
            const profilePath = getShellProfile();
            const exportLine = `export ${name}="${value}"`;
            fs.appendFileSync(profilePath, `\n${exportLine}\n`);
        }

        // Immediately mutate the internal Node process environment
        process.env[name] = value;
        await upsertVariable(name, value, isSystem ? 'system' : 'user', isProtected);

        // Handle initial protection state
        if (isProtected) {
            const list = getProtectedVarsList();
            if (!list.includes(name)) {
                list.push(name);
                fs.writeFileSync(protectedVarsPath, JSON.stringify(list, null, 2), 'utf-8');
            }
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Error occurred. System variables may require Administrator privileges.' };
    }
});

// Protected Variables Handlers
function getProtectedVarsList(): string[] {
    try {
        if (!fs.existsSync(protectedVarsPath)) return [];
        const content = fs.readFileSync(protectedVarsPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

function isVarProtected(name: string): boolean {
    const list = getProtectedVarsList();
    return list.includes(name);
}

ipcMain.handle('get-protected-vars', (): string[] => {
    return getProtectedVarsList();
});

ipcMain.handle('toggle-protected-var', async (_event: any, name: string): Promise<{ success: boolean; isProtected: boolean; error?: string }> => {
    try {
        const list = getProtectedVarsList();
        const index = list.indexOf(name);
        let isProtected = false;

        if (index >= 0) {
            list.splice(index, 1);
        } else {
            list.push(name);
            isProtected = true;
        }

        fs.writeFileSync(protectedVarsPath, JSON.stringify(list, null, 2), 'utf-8');

        // Log to history
        const existing = await getVariableByName(name);
        const val = existing ? existing.value : (process.env[name] || '');
        await logHistory(name, 'UPDATE', val, val, isProtected);

        return { success: true, isProtected };
    } catch (err: any) {
        return { success: false, isProtected: false, error: err.message };
    }
});

ipcMain.handle('protect-vars', async (_event: any, names: string[], protect: boolean): Promise<{ success: boolean; error?: string }> => {
    try {
        let list = getProtectedVarsList();
        const affectedNames: string[] = [];

        if (protect) {
            names.forEach(name => {
                if (!list.includes(name)) {
                    list.push(name);
                    affectedNames.push(name);
                }
            });
        } else {
            names.forEach(name => {
                if (list.includes(name)) affectedNames.push(name);
            });
            list = list.filter(name => !names.includes(name));
        }

        fs.writeFileSync(protectedVarsPath, JSON.stringify(list, null, 2), 'utf-8');

        // Log to history for each affected variable
        for (const name of affectedNames) {
            const existing = await getVariableByName(name);
            const val = existing ? existing.value : (process.env[name] || '');
            await logHistory(name, 'UPDATE', val, val, protect);
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// Groups Handlers
ipcMain.handle('get-groups', (): Record<string, string[]> => {
    try {
        if (!fs.existsSync(groupsPath)) return {};
        const content = fs.readFileSync(groupsPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return {};
    }
});

ipcMain.handle('save-groups', (_event: any, groups: Record<string, string[]>): { success: boolean; error?: string } => {
    try {
        fs.writeFileSync(groupsPath, JSON.stringify(groups, null, 2), 'utf-8');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// Environments Handlers
ipcMain.handle('get-environments', (): string[] => {
    try {
        if (!fs.existsSync(environmentsPath)) return ['Development', 'Staging', 'Production'];
        const content = fs.readFileSync(environmentsPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return ['Development', 'Staging', 'Production'];
    }
});

ipcMain.handle('save-environments', (_event: any, envs: string[]): { success: boolean; error?: string } => {
    try {
        fs.writeFileSync(environmentsPath, JSON.stringify(envs, null, 2), 'utf-8');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// Update environment variable
ipcMain.handle('update-env-var', async (_event: any, name: string, value: string, oldName?: string, isSystem: boolean = false): Promise<{ success: boolean; error?: string }> => {
    const platform = os.platform();

    try {
        if (platform === 'win32') {
            if (oldName && oldName !== name) {
                const targetKey = isSystem ? 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\Environment' : 'HKCU\\Environment';
                await execAsync(`reg delete "${targetKey}" /v "${oldName}" /f`).catch(() => { });
                await deleteVariable(oldName, isVarProtected(oldName));
            }
            await setRegistryValue(name, value, isSystem);
        } else {
            const profilePath = getShellProfile();
            if (oldName && oldName !== name) {
                removeFromShellProfile(profilePath, oldName);
                await deleteVariable(oldName, isVarProtected(oldName));
            }
            updateShellProfile(profilePath, name, value);
        }

        if (oldName && oldName !== name) {
            // Update protected vars list
            let protectedList = getProtectedVarsList();
            if (protectedList.includes(oldName)) {
                protectedList = protectedList.filter(n => n !== oldName);
                if (!protectedList.includes(name)) protectedList.push(name);
                fs.writeFileSync(protectedVarsPath, JSON.stringify(protectedList, null, 2), 'utf-8');
            }

            // Update groups
            try {
                if (fs.existsSync(groupsPath)) {
                    const groupsData = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'));
                    let groupsChanged = false;
                    Object.keys(groupsData).forEach(groupName => {
                        const vars = groupsData[groupName];
                        if (vars.includes(oldName)) {
                            groupsData[groupName] = vars.map((v: string) => v === oldName ? name : v);
                            groupsChanged = true;
                        }
                    });
                    if (groupsChanged) {
                        fs.writeFileSync(groupsPath, JSON.stringify(groupsData, null, 2), 'utf-8');
                    }
                }
            } catch (e) {
                console.error('Error updating groups during rename:', e);
            }
        }

        // Immediately mutate the internal Node process environment
        process.env[name] = value;
        if (oldName && oldName !== name) delete process.env[oldName];
        await upsertVariable(name, value, isSystem ? 'system' : 'user', isVarProtected(name));

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Error occurred. System variables may require Administrator privileges.' };
    }
});

// Delete environment variable
ipcMain.handle('delete-env-var', async (_event: any, name: string, isSystem: boolean = false): Promise<{ success: boolean; error?: string }> => {
    const platform = os.platform();

    try {
        if (platform === 'win32') {
            try {
                // reg delete is more reliable for deletion than setx (which can't delete)
                const targetKey = isSystem ? 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\Environment' : 'HKCU\\Environment';
                await execAsync(`reg delete "${targetKey}" /v "${name}" /f`);
            } catch (regErr: any) {
                // If it's already missing from the registry, we still want to remove it from DB/process
                // Check if message contains 'unable to find' or Portuguese equivalent 'incapaz de encontrar' or 'não foi possível'
                const msg = regErr.message.toLowerCase();
                const isNotFoundError = msg.includes('unable to find') || 
                                       msg.includes('incapaz de encontrar') || 
                                       msg.includes('não foi possível encontrar') ||
                                       msg.includes('não pôde encontrar');
                if (!isNotFoundError) {
                    throw regErr; // Re-throw other errors (like Access Denied)
                }
            }
        } else {
            const profilePath = getShellProfile();
            removeFromShellProfile(profilePath, name);
        }

        // Immediately mutate the internal Node process environment
        delete process.env[name];
        await deleteVariable(name, isVarProtected(name));

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Unknown error' };
    }
});

ipcMain.handle('delete-vars', async (_event: any, names: string[], isSystem: boolean = false): Promise<{ success: boolean; count: number; error?: string }> => {
    const platform = os.platform();
    let count = 0;
    
    try {
        for (const name of names) {
            if (platform === 'win32') {
                try {
                    const targetKey = isSystem ? 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\Environment' : 'HKCU\\Environment';
                    await execAsync(`reg delete "${targetKey}" /v "${name}" /f`);
                } catch (regErr: any) {
                    const msg = regErr.message.toLowerCase();
                    const isNotFoundError = msg.includes('unable to find') || msg.includes('não foi possível');
                    if (!isNotFoundError) console.error(`Error deleting ${name}:`, regErr.message);
                }
            } else {
                const profilePath = getShellProfile();
                removeFromShellProfile(profilePath, name);
            }
            
            delete process.env[name];
            await deleteVariable(name, isVarProtected(name));
            count++;
        }
        return { success: true, count };
    } catch (err: any) {
        return { success: false, count, error: err.message };
    }
});

// Optimization IPC
ipcMain.handle('optimize-var', async (_event, name: string, explicitValue?: string) => {
    try {
        const value = explicitValue || process.env[name] || '';
        if (!value) throw new Error('Variable value is empty or not found');

        const result = optimizeValue(name, value, process.env as Record<string, string>);
        
        // Log to history and update DB
        const existing = await getVariableByName(name);
        if (existing && result.lengthReduced > 0) {
            const currentProtection = isVarProtected(name);
            const isSystem = existing.scope === 'system';
            
            // Apply to registry/shell profile
            if (os.platform() === 'win32') {
                await setRegistryValue(name, result.optimizedValue, isSystem);
            } else {
                updateShellProfile(getShellProfile(), name, result.optimizedValue);
            }

            process.env[name] = result.optimizedValue;

            await logHistory(name, 'OPTIMIZE', value, result.optimizedValue, currentProtection);
            await upsertVariable(name, result.optimizedValue, isSystem ? 'system' : 'user', currentProtection);
        }

        return {
            success: true,
            original: result.originalValue,
            optimized: result.optimizedValue,
            savings: result.lengthReduced
        };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// History IPC
ipcMain.handle('get-var-history', async (_event, varName?: string) => {
    try {
        const history = await getHistory(varName);
        return history;
    } catch (err: any) {
        console.error('Failed to get history:', err);
        return [];
    }
});

ipcMain.handle('restore-var', async (_event, historyId: string) => {
    try {
        const record = await getHistoryById(historyId);
        if (!record) throw new Error('Invalid history record');

        const valToRestore = (record.operation === 'UPDATE' || record.operation === 'RESTORE' || record.operation === 'OPTIMIZE') 
            ? record.old_value 
            : (record.new_value !== null ? record.new_value : record.old_value);
        if (valToRestore === null) throw new Error('This record has no value to restore');

        const { variable_name } = record;
        const new_value = valToRestore;
        const platform = os.platform();

        // Find if it was a system variable to use correct scope
        const existing = await getVariableByName(variable_name);
        const isSystem = existing ? existing.scope === 'system' : false;

        if (platform === 'win32') {
            const escapedValue = new_value.replace(/"/g, '\\"');
            const adminFlag = isSystem ? '/M ' : '';
            await execAsync(`setx ${adminFlag}"${variable_name}" "${escapedValue}"`);
        } else {
            const profilePath = getShellProfile();
            updateShellProfile(profilePath, variable_name, new_value);
        }

        const oldVal = process.env[variable_name] || null;
        process.env[variable_name] = new_value;

        // Restore protection state if recorded
        if (record.was_protected) {
            const list = getProtectedVarsList();
            if (!list.includes(variable_name)) {
                list.push(variable_name);
                fs.writeFileSync(protectedVarsPath, JSON.stringify(list, null, 2), 'utf-8');
            }
        }

        await logHistory(variable_name, 'RESTORE', oldVal, new_value, !!record.was_protected, historyId);
        await upsertVariable(variable_name, new_value, isSystem ? 'system' : 'user', !!record.was_protected);

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-history', async (_event, ids: string[]) => {
    try {
        const { deleteHistory } = await import('./db.js');
        await deleteHistory(ids);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('reset-app', async (): Promise<{ success: boolean; error?: string }> => {
    try {
        fs.writeFileSync(protectedVarsPath, JSON.stringify([]), 'utf-8');
        fs.writeFileSync(groupsPath, JSON.stringify({}), 'utf-8');
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// Export env vars
ipcMain.handle('export-env-vars', async (_event: any, vars: { name: string, value: string, isProtected?: boolean, groupName?: string }[], format: string, isMasked: boolean, mode: string = 'standard', extraParam: string = '', action: string = 'save', excludeProtected: boolean = false, maskBlank: boolean = false): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    if (!mainWindow) return { success: false, error: 'No window' };

    // Use formatting logic established above (extension calculation etc) ...
    let defaultExt = format;
    if (format === 'docx') defaultExt = 'docx';
    if (format === 'env') defaultExt = 'env';
    if (format === 'txt') defaultExt = 'txt';
    let defaultFileName = `env-vars-export.${defaultExt}`;
    if (format === 'script') {
        const isWin = os.platform() === 'win32';
        defaultExt = isWin ? 'cmd' : 'sh';
        if (mode === 'terraform') defaultExt = 'tfvars';
        if (mode === 'appsettings') {
            defaultExt = 'json';
            const env = (extraParam || '|').split('|')[0];
            defaultFileName = env ? `appsettings.${env}.json` : 'appsettings.json';
        }
    }

    let filePath: string;

    if (action === 'save') {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: `Export ${format.toUpperCase()} File`,
            defaultPath: path.join(os.homedir(), defaultFileName),
            filters: [
                { name: `${format.toUpperCase()} Files`, extensions: [defaultExt] }
            ],
        });

        if (result.canceled || !result.filePath) {
            return { success: false, error: 'cancelled' };
        }
        filePath = result.filePath;
    } else {
        filePath = path.join(os.tmpdir(), `env-vars-export_${Date.now()}.${defaultExt}`);
    }

    // Specific rules for format/action associations
    let finalAction = action;
    if (!finalAction) {
        finalAction = (['html', 'pdf'].includes(format)) ? 'browser' : 'editor';
    }

    // Force DOCX to editor always if not save
    if (format === 'docx' && finalAction === 'browser') {
        finalAction = 'editor';
    }

    try {
        // Filter out protected variables if requested
        const varsToProcess = excludeProtected ? vars.filter(v => !v.isProtected) : vars;
        const maskString = maskBlank ? '' : '********';

        const maskedVars = varsToProcess.map(v => ({
            ...v,
            value: (v.isProtected && (isMasked || maskBlank)) ? maskString : v.value
        }));

        if (format === 'json') {
            const content = JSON.stringify(maskedVars, null, 2);
            if (finalAction === 'browser') {
                openInBrowserWithLocalServer(content, 'application/json', 'export.json');
                return { success: true };
            }
            fs.writeFileSync(filePath, content, 'utf-8');
            if (finalAction === 'editor') shell.openPath(filePath);
        } else if (format === 'csv') {
            const content = ['Name,Value,Group', ...maskedVars.map(v => `"${v.name.replace(/"/g, '""')}","${v.value.replace(/"/g, '""')}","${(v.groupName || '').replace(/"/g, '""')}"`)].join('\n');
            if (finalAction === 'browser') {
                openInBrowserWithLocalServer(content, 'text/csv', 'export.csv');
                return { success: true };
            }
            fs.writeFileSync(filePath, content, 'utf-8');
            if (action === 'editor') shell.openPath(filePath);
        } else if (format === 'txt' || format === 'env') {
            const content = maskedVars.map(v => {
                const line = `${v.name}=${v.value}`;
                return (v.isProtected && isMasked) ? (format === 'env' ? `# ${line}` : line) : line;
            }).join('\n');
            if (finalAction === 'browser') {
                openInBrowserWithLocalServer(content, 'text/plain', format === 'env' ? '.env' : 'export.txt');
                return { success: true };
            }
            fs.writeFileSync(filePath, content, 'utf-8');
            if (finalAction === 'editor') shell.openPath(filePath);
        } else if (format === 'script') {
            const isWin = os.platform() === 'win32';
            const lines: string[] = [];
            
            if (isWin && mode === 'standard') lines.push('@echo off');
            if (mode === 'github') {
                lines.push('echo Y | gh auth login --web --git-protocol https');
                lines.push('');
            }

            if (mode === 'appsettings') {
                const [envVal, includePrefixVal] = (extraParam || '|').split('|');
                const includePrefix = includePrefixVal !== 'false';
                const data: any = {};
                
                maskedVars.forEach(v => {
                    let name = v.name;
                    if (!includePrefix) {
                        const parts = name.split(/__|:/).filter(p => !!p);
                        if (parts.length > 1) {
                            name = parts.slice(1).join('__');
                        }
                    }
                    
                    const pathParts = name.split(/__|:/).filter(p => !!p);
                    let current = data;
                    for (let i = 0; i < pathParts.length; i++) {
                        const segment = pathParts[i];
                        if (i === pathParts.length - 1) {
                            current[segment] = v.value;
                        } else {
                            if (!current[segment] || typeof current[segment] !== 'object') {
                                current[segment] = {};
                            }
                            current = current[segment];
                        }
                    }
                });

                // Post-process to convert objects with numeric keys to arrays
                const convertToArray = (obj: any): any => {
                    if (obj === null || typeof obj !== 'object') return obj;
                    
                    const keys = Object.keys(obj);
                    const isAllNumeric = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
                    
                    if (isAllNumeric) {
                        const sortedKeys = keys.map(Number).sort((a, b) => a - b);
                        const minKey = sortedKeys[0];
                        const arr: any[] = [];
                        
                        keys.forEach(k => {
                            const index = parseInt(k, 10);
                            // If user used 1-based indexing (e.g. __1), convert to 0-based
                            const arrayIdx = minKey === 1 ? index - 1 : index;
                            if (arrayIdx >= 0) {
                                arr[arrayIdx] = convertToArray(obj[k]);
                            }
                        });
                        return arr;
                    }

                    Object.keys(obj).forEach(k => {
                        obj[k] = convertToArray(obj[k]);
                    });
                    return obj;
                };

                const finalData = convertToArray(data);
                const content = JSON.stringify(finalData, null, 2);
                if (finalAction === 'browser') {
                    const filename = envVal ? `appsettings.${envVal}.json` : 'appsettings.json';
                    openInBrowserWithLocalServer(content, 'application/json', filename);
                } else {
                    fs.writeFileSync(filePath, content, 'utf-8');
                    shell.openPath(filePath);
                }
                return { success: true };
            }

            maskedVars.forEach(v => {
                const name = v.name;
                const val = v.value;
                let line = '';

                if (mode === 'standard') {
                    if (isWin) {
                        line = `set "${name}=${val}"`;
                    } else {
                        line = `export ${name}="${val}"`;
                    }
                } else if (mode === 'aws') {
                     line = `export AWS_${name.toUpperCase()}="${val}"`;
                } else if (mode === 'azure') {
                     line = `az configure --defaults ${name}="${val}"`;
                } else if (mode === 'terraform') {
                     line = `${name.toLowerCase()} = "${val}"`;
                } else if (mode === 'github') {
                     const repoFlag = extraParam ? ` --repo ${extraParam}` : '';
                     line = `gh secret set ${name} -b"${val}"${repoFlag}`;
                }

                if (v.isProtected && isMasked) {
                    if (isWin && mode === 'standard') {
                         lines.push(`REM ${line}`);
                    } else {
                         lines.push(`# ${line}`);
                    }
                } else {
                    lines.push(line);
                }
            });

            // Add pause at the end (unless it's a .tfvars file)
            if (mode !== 'terraform') {
                lines.push('');
                if (isWin) {
                    lines.push('pause');
                } else {
                    lines.push('read -p "Press any key to continue..."');
                }
            }

            const content = lines.join(os.EOL);
            if (finalAction === 'browser') {
                const filename = mode === 'terraform' ? 'variables.tfvars' : (isWin ? 'export.bat' : 'export.sh');
                openInBrowserWithLocalServer(content, 'text/plain', filename);
            } else {
                fs.writeFileSync(filePath, content, 'utf-8');
                if (finalAction === 'editor') shell.openPath(filePath);
            }
        } else if (format === 'html') {
            let htmlRows = '';
            let currentGroup: string | undefined | null = null;
            for (const v of maskedVars) {
                if (v.groupName !== currentGroup) {
                    currentGroup = v.groupName;
                    const groupTitle = currentGroup || 'Ungrouped Variables';
                    htmlRows += `<tr class="group-header"><td colspan="2">${groupTitle}</td></tr>`;
                    htmlRows += `<tr class="col-headers"><th>Name</th><th>Value</th></tr>`;
                }
                htmlRows += `<tr><td>${v.name}</td><td>${v.value}</td></tr>`;
            }
            const htmlContent = `<!DOCTYPE html><html><head><style>body { font-family: sans-serif; padding: 20px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ccc; padding: 8px; text-align: left; } .group-header { background: #eee; font-weight: bold; }</style></head><body><h2>Environment Variables</h2><table>${htmlRows}</table></body></html>`;
            
            // We always write the file if it's meant to be opened or saved
            fs.writeFileSync(filePath, htmlContent, 'utf-8');

            const actualAction = (finalAction === 'editor' || finalAction === 'browser') ? 'browser' : 'save';
            if (actualAction === 'browser') {
                shell.openExternal(url.pathToFileURL(filePath).toString());
            }
            return { success: true, filePath };
        } else if (format === 'pdf') {
            let htmlRows = '';
            let currentGroup: string | undefined | null = null;
            for (const v of maskedVars) {
                if (v.groupName !== currentGroup) {
                    currentGroup = v.groupName;
                    const groupTitle = currentGroup || 'Ungrouped Variables';
                    htmlRows += `<tr class="group-header"><td colspan="2">${groupTitle}</td></tr>`;
                }
                htmlRows += `<tr><td>${v.name}</td><td>${v.value}</td></tr>`;
            }
            const htmlContent = `<html><head><style>body { font-family: sans-serif; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ccc; padding: 5px; }</style></head><body><h2>Variables</h2><table>${htmlRows}</table></body></html>`;
            const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
            await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
            const pdfData = await win.webContents.printToPDF({ printBackground: true, landscape: true });
            fs.writeFileSync(filePath, pdfData);
            win.close();

            const actualAction = (finalAction === 'editor' || finalAction === 'browser') ? 'browser' : 'save';
            if (actualAction === 'browser') {
                shell.openExternal(url.pathToFileURL(filePath).toString());
            } 
            return { success: true, filePath };
        } else if (format === 'docx') {
            const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType } = require('docx');
            const tableRows = maskedVars.map(v => new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph(v.name)] }),
                    new TableCell({ children: [new Paragraph(v.value)] })
                ]
            }));
            const doc = new Document({
                sections: [{
                    children: [
                        new Paragraph({ text: "Environment Variables", heading: "Heading1" }),
                        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows })
                    ]
                }]
            });
            const buffer = await Packer.toBuffer(doc);
            fs.writeFileSync(filePath, buffer);
            if (finalAction === 'editor' || finalAction === 'browser') {
                // Ensure DOCX always opens in the editor, as browsers don't natively render them well
                shell.openPath(filePath);
            }
            return { success: true, filePath };
        }
        return { success: true, filePath };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// Import env vars from JSON
ipcMain.handle('import-env-vars', async (): Promise<{ success: boolean; vars?: EnvVar[]; error?: string }> => {
    if (!mainWindow) return { success: false, error: 'No window' };

    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Environment Variables',
        filters: [
            { name: 'Environment Files', extensions: ['json', 'env', 'txt'] },
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'Text Files', extensions: ['env', 'txt'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
    }

    try {
        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, 'utf-8');
        let envVars: EnvVar[] = [];

        if (filePath.toLowerCase().endsWith('.json')) {
            try {
                const data = JSON.parse(content);
                
                if (Array.isArray(data)) {
                    envVars = data;
                } else {
                    // Flattener supporting nested objects and arrays
                    const flatten = (obj: any, prefix = ''): { name: string, value: string }[] => {
                        let items: { name: string, value: string }[] = [];
                        if (Array.isArray(obj)) {
                            obj.forEach((val, idx) => {
                                const newKey = `${prefix}__${idx + 1}`;
                                if (val !== null && typeof val === 'object') {
                                    items.push(...flatten(val, newKey));
                                } else {
                                    items.push({ name: newKey, value: String(val) });
                                }
                            });
                        } else if (obj !== null && typeof obj === 'object') {
                            for (const [key, value] of Object.entries(obj)) {
                                const newKey = prefix ? `${prefix}__${key}` : key;
                                if (value !== null && typeof value === 'object') {
                                    items.push(...flatten(value, newKey));
                                } else {
                                    items.push({ name: newKey, value: String(value) });
                                }
                            }
                        }
                        return items;
                    };

                    envVars = flatten(data).map(item => ({
                        name: item.name,
                        value: item.value,
                        isSystem: false
                    }));
                }
            } catch (jsonErr: any) {
                return { success: false, error: `JSON Parse Error: ${jsonErr.message}` };
            }
        } else {
            // Handle .env or plain text
            const lines = content.split(/\r?\n/);
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                
                const firstEqual = trimmed.indexOf('=');
                if (firstEqual > 0) {
                    const name = trimmed.substring(0, firstEqual).trim();
                    let value = trimmed.substring(firstEqual + 1).trim();
                    
                    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.substring(1, value.length - 1);
                    }
                    
                    if (name) {
                        envVars.push({ name, value, isSystem: false });
                    }
                }
            });
        }

        if (envVars.length === 0) {
            return { success: false, error: 'No valid environment variables discovered in this file.' };
        }

        return { success: true, vars: envVars };
    } catch (err: any) {
        return { success: false, error: `System error during import: ${err.message}` };
    }
});

// ─── Shell Profile Helpers ────────────────────────────────────────────────────

function getShellProfile(): string {
    const home = os.homedir();
    const shell = process.env.SHELL || '/bin/bash';

    if (shell.includes('zsh')) {
        return path.join(home, '.zshrc');
    }
    return path.join(home, '.bashrc');
}

function updateShellProfile(profilePath: string, name: string, value: string): void {
    if (!fs.existsSync(profilePath)) {
        fs.writeFileSync(profilePath, '', 'utf-8');
    }

    let content = fs.readFileSync(profilePath, 'utf-8');
    const regex = new RegExp(`^export ${name}=.*$`, 'm');

    if (regex.test(content)) {
        content = content.replace(regex, `export ${name}="${value}"`);
    } else {
        content += `\nexport ${name}="${value}"\n`;
    }

    fs.writeFileSync(profilePath, content, 'utf-8');
}

function removeFromShellProfile(profilePath: string, name: string): void {
    if (!fs.existsSync(profilePath)) return;

    let content = fs.readFileSync(profilePath, 'utf-8');
    const regex = new RegExp(`^export ${name}=.*\n?`, 'gm');
    content = content.replace(regex, '');
    fs.writeFileSync(profilePath, content, 'utf-8');
}
