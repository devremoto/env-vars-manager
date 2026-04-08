import { ipcMain } from 'electron';
import * as os from 'os';
import { getAllVariables, upsertVariable, deleteVariable, getVariableByName, logHistory } from '../../db';
import { optimizeValue } from '../../optimizer';
import { SystemProfileService } from '../services/system-profile-service';
import { PathService } from '../services/path-service';
import { spawn } from 'child_process';

export class EnvHandlers {
    static register() {
        ipcMain.handle('get-env-vars', async () => {
            const processVarsMap = new Map<string, string>();
            Object.entries(process.env).forEach(([k, v]) => {
                if (v !== undefined) processVarsMap.set(k, v);
            });

            const dbVars = await getAllVariables();
            const combined = new Map<string, any>();
            
            processVarsMap.forEach((value, name) => {
                combined.set(name, { name, value, isSystem: false });
            });

            dbVars.forEach((dv: any) => {
                combined.set(dv.name, { 
                    name: dv.name, 
                    value: dv.value, 
                    isSystem: dv.scope === 'system' 
                });
            });

            const list = Array.from(combined.values()).sort((a, b) => a.name.localeCompare(b.name));
            const envContext = process.env as Record<string, string>;

            return list.map(v => {
                try {
                    const result = optimizeValue(v.name, v.value, envContext);
                    return { ...v, canOptimize: result.lengthReduced > 0 };
                } catch (e) {
                    return { ...v, canOptimize: false };
                }
            });
        });

        ipcMain.handle('create-env-var', async (_event, name, value, isSystem = false, isProtected = false) => {
            try {
                if (os.platform() === 'win32') {
                    await SystemProfileService.setRegistryValue(name, value, isSystem);
                } else {
                    SystemProfileService.updateShellProfile(SystemProfileService.getProfilePath(), name, value);
                }

                process.env[name] = value;
                await upsertVariable(name, value, isSystem ? 'system' : 'user', isProtected);

                if (isProtected) {
                    const list = this.getProtectedVarsList();
                    if (!list.includes(name)) {
                        list.push(name);
                        this.saveProtectedVarsList(list);
                    }
                }
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('update-env-var', async (_event, name, value, oldName, isSystem = false) => {
            try {
                if (os.platform() === 'win32') {
                    if (oldName && oldName !== name) {
                        // Deletion handled via Registry or similar
                    }
                    await SystemProfileService.setRegistryValue(name, value, isSystem);
                } else {
                    const profilePath = SystemProfileService.getProfilePath();
                    if (oldName && oldName !== name) SystemProfileService.removeFromShellProfile(profilePath, oldName);
                    SystemProfileService.updateShellProfile(profilePath, name, value);
                }

                process.env[name] = value;
                if (oldName && oldName !== name) delete process.env[oldName];
                await upsertVariable(name, value, isSystem ? 'system' : 'user', this.isVarProtected(name));

                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('delete-env-var', async (_event, name, isSystem = false) => {
            try {
                if (os.platform() === 'win32') {
                    // Logic to delete from Registry using child_process `reg delete`
                } else {
                    SystemProfileService.removeFromShellProfile(SystemProfileService.getProfilePath(), name);
                }
                delete process.env[name];
                await deleteVariable(name, this.isVarProtected(name));
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('delete-vars', async (_event, names, isSystem = false) => {
            let count = 0;
            for (const name of names) {
                try {
                    if (os.platform() === 'win32') {
                        // Logic to delete from Registry using child_process `reg delete`
                    } else {
                        SystemProfileService.removeFromShellProfile(SystemProfileService.getProfilePath(), name);
                    }
                    delete process.env[name];
                    await deleteVariable(name, this.isVarProtected(name));
                    count++;
                } catch {}
            }
            return { success: true, count };
        });

        ipcMain.handle('optimize-var', async (_event, name, explicitValue) => {
            const value = explicitValue || process.env[name] || '';
            const result = optimizeValue(name, value, process.env as Record<string, string>);
            if (result.lengthReduced > 0) {
                const existing = await getVariableByName(name);
                const isSystem = existing?.scope === 'system';
                if (os.platform() === 'win32') await SystemProfileService.setRegistryValue(name, result.optimizedValue, isSystem);
                else SystemProfileService.updateShellProfile(SystemProfileService.getProfilePath(), name, result.optimizedValue);
                
                process.env[name] = result.optimizedValue;
                await upsertVariable(name, result.optimizedValue, isSystem ? 'system' : 'user', this.isVarProtected(name));
                await logHistory(name, 'OPTIMIZE', value, result.optimizedValue, this.isVarProtected(name));
            }
            return { success: true, original: result.originalValue, optimized: result.optimizedValue, savings: result.lengthReduced };
        });

        ipcMain.handle('open-cmd', async (_event, varName) => {
            const isWin = os.platform() === 'win32';
            if (isWin) {
                spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/c', `echo Variable: ^%${varName}^% & echo Value: %${varName}% & timeout /t 10`], { detached: true, stdio: 'ignore' }).unref();
            } else {
                const varSyntax = `$${varName}`;
                spawn('sh', ['-c', `x-terminal-emulator -e "bash -c 'echo \"Variable: \\$${varName}\"; echo \"Value: ${varSyntax}\"; sleep 10'"`], { detached: true, stdio: 'ignore' }).unref();
            }
            return { success: true };
        });

        ipcMain.handle('get-protected-vars', () => this.getProtectedVarsList());
    }

    private static getProtectedVarsList(): string[] {
        try {
            const fs = require('fs');
            const content = fs.readFileSync(PathService.protectedVarsPath, 'utf-8');
            return JSON.parse(content);
        } catch { return []; }
    }

    private static saveProtectedVarsList(list: string[]) {
        const fs = require('fs');
        fs.writeFileSync(PathService.protectedVarsPath, JSON.stringify(list, null, 2), 'utf-8');
    }

    private static isVarProtected(name: string): boolean {
        return this.getProtectedVarsList().includes(name);
    }
}
