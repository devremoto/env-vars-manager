import { ipcMain, dialog } from 'electron';
import * as os from 'os';
import * as path from 'path';
import { ExportService } from '../services/export-service';

export class ExportHandlers {
    static register(mainWindow: any) {
        ipcMain.handle('export-env-vars', async (_event, vars, format, isMasked, mode = 'standard', extraParam = '', action, excludeProtected, maskBlank) => {
            if (!mainWindow) return { success: false, error: 'No main window' };

            const options = {
                title: 'Save Export',
                defaultPath: require('path').join(require('os').homedir(), format === 'env' ? '.env' : `export.${format === 'script' ? 'bat' : format}`),
                filters: [] as any[]
            };

            if (format === 'json') options.filters.push({ name: 'JSON', extensions: ['json'] });
            else if (format === 'csv') options.filters.push({ name: 'CSV', extensions: ['csv'] });
            else if (format === 'txt') options.filters.push({ name: 'Text', extensions: ['txt'] });
            else if (format === 'env') options.filters.push({ name: 'Env File', extensions: ['env'] });
            else if (format === 'script') options.filters.push({ name: 'Script', extensions: ['bat', 'ps1', 'sh'] });
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
    }
}
