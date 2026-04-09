import { ipcMain, dialog } from 'electron';
import * as os from 'os';
import * as path from 'path';
import { ExportService } from '../services/export-service';

export class ExportHandlers {
    static register(mainWindow: any) {
        ipcMain.handle('export-env-vars', async (_event, vars, format, isMasked, mode = 'standard', extraParam = '', action, excludeProtected, maskBlank) => {
            if (!mainWindow) return { success: false, error: 'No main window' };

            let defaultExt = format === 'script' ? 'bat' : format;
            let fileName = `export.${defaultExt}`;
            
            if (format === 'script' && mode === 'appsettings') {
                const env = (extraParam || '').split('|')[0];
                fileName = env ? `appsettings.${env}.json` : 'appsettings.json';
            } else if (format === 'env') {
                fileName = '.env';
            }
            
            const options = {
                title: 'Save Export',
                defaultPath: require('path').join(require('os').homedir(), fileName),
                filters: [] as any[]
            };

            if (format === 'json') options.filters.push({ name: 'JSON', extensions: ['json'] });
            else if (format === 'csv') options.filters.push({ name: 'CSV', extensions: ['csv'] });
            else if (format === 'txt') options.filters.push({ name: 'Text', extensions: ['txt'] });
            else if (format === 'env') options.filters.push({ name: 'Env File', extensions: ['env'] });
            else if (format === 'script') {
                if (mode === 'appsettings') options.filters.push({ name: 'JSON', extensions: ['json'] });
                else options.filters.push({ name: 'Script', extensions: ['bat', 'ps1', 'sh'] });
            }
            else if (format === 'html') options.filters.push({ name: 'HTML', extensions: ['html'] });

            let filePath: string | undefined;
            const finalAction = action || 'save';
            
            if (finalAction === 'save' || finalAction === 'editor') {
                const result = await dialog.showSaveDialog(mainWindow, options);
                if (result.canceled || !result.filePath) return { success: false };
                filePath = result.filePath;
            }

            return ExportService.handleExport(
                vars, 
                format, 
                isMasked, 
                mode, 
                extraParam, 
                finalAction, 
                maskBlank, 
                filePath
            );
        });
        ipcMain.handle('import-env-vars', async (): Promise<{ success: boolean; vars?: any[]; error?: string }> => {
            if (!mainWindow) return { success: false, error: 'No main window' };

            try {
                const result = await dialog.showOpenDialog(mainWindow, {
                    title: 'Import Variables',
                    properties: ['openFile'],
                    filters: [
                        { name: 'Environment Variables', extensions: ['env', 'json', 'txt', 'csv'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });

                if (result.canceled || result.filePaths.length === 0) {
                    return { success: false };
                }

                const filePath = result.filePaths[0];
                const fs = require('fs');
                const content = fs.readFileSync(filePath, 'utf-8');
                
                const vars: any[] = [];
                const ext = path.extname(filePath).toLowerCase();

                if (ext === '.json') {
                    const data = JSON.parse(content);
                    if (Array.isArray(data)) {
                        vars.push(...data.map(item => ({
                            name: item.name || Object.keys(item)[0],
                            value: item.value || Object.values(item)[0]
                        })));
                    } else {
                        const flatten = (obj: any, prefix = '') => {
                            for (const [key, val] of Object.entries(obj)) {
                                const newKey = prefix ? `${prefix}__${key}` : key;
                                if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                                    flatten(val, newKey);
                                } else {
                                    vars.push({ name: newKey, value: String(val) });
                                }
                            }
                        };
                        flatten(data);
                    }
                } else if (ext === '.csv') {
                    const lines = content.split(/\r?\n/);
                    lines.forEach(line => {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('name,')) return;
                        const parts = trimmed.split(',');
                        if (parts.length >= 2) {
                            const name = parts[0].trim();
                            const value = parts.slice(1).join(',').trim().replace(/(^"|"$)/g, '');
                            if (name) vars.push({ name, value });
                        }
                    });
                } else {
                    const lines = content.split(/\r?\n/);
                    lines.forEach((line) => {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith('#')) return;
                        
                        const idx = trimmed.indexOf('=');
                        if (idx > 0) {
                            const name = trimmed.substring(0, idx).trim();
                            const value = trimmed.substring(idx + 1).trim()
                                .replace(/(^['"](.*)['"]$)/, '$2');
                            if (name) vars.push({ name, value });
                        }
                    });
                }

                return { success: true, vars };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });
    }
}
