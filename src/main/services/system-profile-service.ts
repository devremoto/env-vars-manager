import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';

const execAsync = promisify(exec);

export class SystemProfileService {
    static getProfilePath(): string {
        const platform = os.platform();
        if (platform === 'darwin') return path.join(os.homedir(), '.zshrc');
        if (platform === 'linux') return path.join(os.homedir(), '.bashrc');
        return '';
    }

    static async setRegistryValue(name: string, value: string, isSystem: boolean): Promise<void> {
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

    static updateShellProfile(path: string, name: string, value: string) {
        if (!fs.existsSync(path)) fs.writeFileSync(path, '', 'utf-8');
        let content = fs.readFileSync(path, 'utf-8');
        const exportRegex = new RegExp(`^export\\s+${name}=.*$`, 'm');
        const newLine = `export ${name}="${value}"`;
        
        if (exportRegex.test(content)) {
            content = content.replace(exportRegex, newLine);
        } else {
            content += (content.endsWith('\n') ? '' : '\n') + newLine + '\n';
        }
        fs.writeFileSync(path, content, 'utf-8');
    }

    static removeFromShellProfile(path: string, name: string) {
        if (!fs.existsSync(path)) return;
        let content = fs.readFileSync(path, 'utf-8');
        const exportRegex = new RegExp(`^export\\s+${name}=.*$\\r?\\n?`, 'gm');
        if (exportRegex.test(content)) {
            content = content.replace(exportRegex, '');
            fs.writeFileSync(path, content, 'utf-8');
        }
    }
}
