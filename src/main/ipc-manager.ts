import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import * as os from 'os';
import * as path from 'path';
import { PathService } from './services/path-service';
import { SystemProfileService } from './services/system-profile-service';
import { openInBrowserWithLocalServer } from './services/browser-preview';
import { EnvHandlers } from './ipc/env-handlers';
import { OsHandlers } from './ipc/os-handlers';
import { GroupHandlers } from './ipc/group-handlers';
import { EnvironmentHandlers } from './ipc/environment-handlers';
import { ExportHandlers } from './ipc/export-handlers';
import { HistoryHandlers } from './ipc/history-handlers';
import { expandEnvVars } from './utils/string-utils';

export class IpcManager {
    static register(mainWindow: BrowserWindow) {
        // Window controls
        ipcMain.handle('window-minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
        ipcMain.handle('window-maximize', (event) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (!win) return;
            win.isMaximized() ? win.unmaximize() : win.maximize();
        });
        ipcMain.handle('window-close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
        ipcMain.handle('open-url', (_event, url: string) => shell.openExternal(url));

        // File Path Handlers
        ipcMain.handle('open-path', (_event, rawPath: string) => shell.openPath(expandEnvVars(rawPath)));
        ipcMain.handle('show-item-in-folder', (_event, rawPath: string) => shell.showItemInFolder(expandEnvVars(rawPath)));

        // Delegate to specific handler modules
        EnvHandlers.register();
        OsHandlers.register();
        GroupHandlers.register();
        EnvironmentHandlers.register();
        ExportHandlers.register(mainWindow);
        HistoryHandlers.register();

        // General settings resets or app cleanup
        ipcMain.handle('reset-app', async () => {
            const fs = require('fs');
            fs.writeFileSync(PathService.protectedVarsPath, JSON.stringify([]), 'utf-8');
            fs.writeFileSync(PathService.groupsPath, JSON.stringify({}), 'utf-8');
            return { success: true };
        });
    }
}
