import { ipcMain, BrowserWindow } from 'electron';
import * as os from 'os';
import { getAllVariables, upsertVariable, deleteVariable, getVariableByName, logHistory } from '../../db';
import { optimizeValue } from '../../optimizer';
import { SystemProfileService } from '../services/system-profile-service';
import { PathService } from '../services/path-service';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
                    const result = await this.deleteWindowsEnvVarByScope(name, isSystem);
                    if (result.needsRefresh) {
                        try {
                            await execAsync('setx __ENV_REFRESH__ "" && reg delete "HKCU\\Environment" /v __ENV_REFRESH__ /f 2>nul');
                        } catch (e) { }
                    }
                } else {
                    SystemProfileService.removeFromShellProfile(SystemProfileService.getProfilePath(), name);
                }
                delete process.env[name];
                await deleteVariable(name, this.isVarProtected(name));

                // Notify renderer windows to refresh their view
                BrowserWindow.getAllWindows().forEach(w => w.webContents.send('env-updated'));
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('delete-vars', async (_event, names, isSystem = false) => {
            let count = 0;
            const errors: string[] = [];
            let userRefreshNeeded = false;
            for (const name of names) {
                try {
                    if (os.platform() === 'win32') {
                        const result = await this.deleteWindowsEnvVarByScope(name, isSystem);
                        if (result.needsRefresh) {
                            userRefreshNeeded = true;
                        }
                    } else {
                        SystemProfileService.removeFromShellProfile(SystemProfileService.getProfilePath(), name);
                    }

                    delete process.env[name];
                    await deleteVariable(name, this.isVarProtected(name));
                    count++;
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    errors.push(`${name}: ${msg}`);
                    console.error('delete-vars item error:', e);
                }
            }

            if (os.platform() === 'win32' && userRefreshNeeded) {
                try {
                    await execAsync('setx __ENV_REFRESH__ "" && reg delete "HKCU\\Environment" /v __ENV_REFRESH__ /f 2>nul');
                } catch (e) { }
            }

            // Notify renderer windows once after batch delete
            BrowserWindow.getAllWindows().forEach(w => w.webContents.send('env-updated'));
            if (errors.length > 0) {
                return { success: false, count, error: errors.join(' | ') };
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

        ipcMain.handle('protect-vars', (_event, names: string[], protect: boolean) => {
            try {
                let list = this.getProtectedVarsList();
                if (protect) {
                    names.forEach(name => { if (!list.includes(name)) list.push(name); });
                } else {
                    list = list.filter(n => !names.includes(n));
                }
                this.saveProtectedVarsList(list);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('unprotect-vars', (_event, names: string[]) => {
            try {
                let list = this.getProtectedVarsList();
                list = list.filter(n => !names.includes(n));
                this.saveProtectedVarsList(list);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('toggle-protected-var', (_event, name: string) => {
            try {
                let list = this.getProtectedVarsList();
                const isProtected = list.includes(name);
                if (isProtected) {
                    list = list.filter(n => n !== name);
                } else {
                    list.push(name);
                }
                this.saveProtectedVarsList(list);
                return { success: true, isProtected: !isProtected };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

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

    private static async runRegCommand(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
        return await new Promise((resolve) => {
            const reg = spawn('reg', args);
            let stdout = '';
            let stderr = '';
            reg.stdout.on('data', (d: any) => stdout += d.toString());
            reg.stderr.on('data', (d: any) => stderr += d.toString());
            reg.on('close', (code: number) => resolve({ code: code ?? 1, stdout, stderr }));
        });
    }

    private static async registryValueExists(targetKey: string, name: string): Promise<boolean> {
        const result = await this.runRegCommand(['query', targetKey, '/v', name]);
        return result.code === 0;
    }

    private static isAccessDenied(text: string): boolean {
        const msg = text.toLowerCase();
        return msg.includes('access is denied') || msg.includes('acesso negado');
    }

    private static async deleteWindowsEnvVarByScope(name: string, isSystemHint: boolean): Promise<{ needsRefresh: boolean }> {
        const userKey = 'HKCU\\Environment';
        const systemKey = 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\Environment';
        const orderedKeys = isSystemHint ? [systemKey, userKey] : [userKey, systemKey];

        let foundAny = false;
        let deletedAny = false;
        let touchedUserScope = false;
        let accessDeniedKeys: string[] = [];

        for (const targetKey of orderedKeys) {
            const exists = await this.registryValueExists(targetKey, name);
            if (!exists) continue;

            foundAny = true;
            const result = await this.runRegCommand(['delete', targetKey, '/v', name, '/f']);
            if (result.code === 0) {
                deletedAny = true;
                if (targetKey === userKey) touchedUserScope = true;
                continue;
            }

            const combinedOutput = `${result.stdout}\n${result.stderr}`;
            if (this.isAccessDenied(combinedOutput)) {
                accessDeniedKeys.push(targetKey);
                continue;
            }

            throw new Error(result.stderr || result.stdout || `Failed to delete ${name} from ${targetKey}`);
        }

        if (!foundAny) {
            return { needsRefresh: true };
        }

        if (accessDeniedKeys.length > 0) {
            if (deletedAny) {
                throw new Error(`Partially deleted "${name}". Missing permission for ${accessDeniedKeys.join(', ')}. Run app as Administrator to fully delete.`);
            }
            throw new Error(`Cannot delete "${name}". Access denied for ${accessDeniedKeys.join(', ')}. Run app as Administrator for system variables.`);
        }

        return { needsRefresh: touchedUserScope };
    }
}
