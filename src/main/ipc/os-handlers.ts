import { ipcMain } from 'electron';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class OsHandlers {
    static register() {
        ipcMain.handle('check-is-admin', async (): Promise<boolean> => {
            if (os.platform() !== 'win32') {
                return (process.getuid ? process.getuid() === 0 : false);
            }
            try {
                await execAsync('net session');
                return true;
            } catch {
                return false;
            }
        });

        ipcMain.handle('get-os-vars', async () => {
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

            return { "Predefined OS Variables": standardVars };
        });
    }
}
