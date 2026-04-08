import { ipcMain } from 'electron';
import * as fs from 'fs';
import { PathService } from '../services/path-service';

export class EnvironmentHandlers {
    static register() {
        ipcMain.handle('get-environments', (): string[] => {
            try {
                if (!fs.existsSync(PathService.environmentsPath)) return ['Development', 'Staging', 'Production'];
                const content = fs.readFileSync(PathService.environmentsPath, 'utf-8');
                return JSON.parse(content);
            } catch {
                return ['Development', 'Staging', 'Production'];
            }
        });

        ipcMain.handle('save-environments', (_event, envs: string[]) => {
            try {
                fs.writeFileSync(PathService.environmentsPath, JSON.stringify(envs, null, 2), 'utf-8');
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });
    }
}
