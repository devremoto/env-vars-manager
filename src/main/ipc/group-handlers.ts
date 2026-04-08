import { ipcMain } from 'electron';
import * as fs from 'fs';
import { PathService } from '../services/path-service';

export class GroupHandlers {
    static register() {
        ipcMain.handle('get-groups', (): Record<string, string[]> => {
            try {
                if (!fs.existsSync(PathService.groupsPath)) return {};
                const content = fs.readFileSync(PathService.groupsPath, 'utf-8');
                return JSON.parse(content);
            } catch {
                return {};
            }
        });

        ipcMain.handle('save-groups', (_event, groups: Record<string, string[]>) => {
            try {
                fs.writeFileSync(PathService.groupsPath, JSON.stringify(groups, null, 2), 'utf-8');
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });
    }
}
