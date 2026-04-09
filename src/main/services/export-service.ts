import * as fs from 'fs';
import * as os from 'os';
import { shell } from 'electron';
import { openInBrowserWithLocalServer } from './browser-preview';

export class ExportService {
    static async handleExport(
        vars: any[], 
        format: string, 
        isMasked: boolean, 
        mode: string, 
        extraParam: string, 
        finalAction: string, 
        maskBlank: boolean, 
        filePath: string | undefined
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        const maskString = maskBlank ? '' : '********';
        const maskedVars = vars.map(v => ({
            ...v,
            value: (v.isProtected && (isMasked || maskBlank)) ? maskString : v.value
        }));

        if (format === 'json') {
            const content = JSON.stringify(maskedVars, null, 2);
            if (finalAction === 'browser') {
                openInBrowserWithLocalServer(content, 'application/json', 'export.json');
                return { success: true };
            }
            if (filePath) fs.writeFileSync(filePath, content, 'utf-8');
            if (finalAction === 'editor' && filePath) shell.openPath(filePath);
            return { success: true, filePath };
        }

        if (format === 'csv') {
            const content = ['Name,Value,Group', ...maskedVars.map(v => `"${v.name.replace(/"/g, '""')}","${v.value.replace(/"/g, '""')}","${(v.groupName || '').replace(/"/g, '""')}"`)].join('\n');
            if (finalAction === 'browser') {
                openInBrowserWithLocalServer(content, 'text/csv', 'export.csv');
                return { success: true };
            }
            if (filePath) fs.writeFileSync(filePath, content, 'utf-8');
            if (finalAction === 'editor' && filePath) shell.openPath(filePath);
            return { success: true, filePath };
        }

        if (format === 'txt' || format === 'env') {
            const content = maskedVars.map(v => {
                const line = `${v.name}=${v.value}`;
                return (v.isProtected && (isMasked || maskBlank)) ? (format === 'env' ? `# ${line}` : line) : line;
            }).join('\n');
            if (finalAction === 'browser') {
                openInBrowserWithLocalServer(content, 'text/plain', format === 'env' ? '.env' : 'export.txt');
                return { success: true };
            }
            if (filePath) fs.writeFileSync(filePath, content, 'utf-8');
            if (finalAction === 'editor' && filePath) shell.openPath(filePath);
            return { success: true, filePath };
        }

        if (format === 'script') {
            const content = this.generateScript(maskedVars, mode, extraParam);
            if (finalAction === 'browser') {
                let [targetOs, winCmd] = (mode === 'standard' || mode === 'aws' || mode === 'azure' || mode === 'terraform') 
                    ? (extraParam || '|').split('|') 
                    : [os.platform() === 'win32' ? 'windows' : 'linux', 'set'];
                
                targetOs = targetOs || (os.platform() === 'win32' ? 'windows' : 'linux');
                winCmd = winCmd || 'set';
                const isWin = targetOs === 'windows';

                let filename = isWin ? 'export.bat' : 'export.sh';
                let contentType = 'text/plain';
                
                if (mode === 'terraform') filename = 'variables.tfvars';
                if (isWin && winCmd === 'powershell') filename = 'export.ps1';
                if (mode === 'appsettings') {
                    const env = (extraParam || '').split('|')[0];
                    filename = env ? `appsettings.${env}.json` : 'appsettings.json';
                    contentType = 'application/json';
                }
                
                openInBrowserWithLocalServer(content, contentType, filename);
                return { success: true };
            } else if (filePath) {
                fs.writeFileSync(filePath, content, 'utf-8');
                if (finalAction === 'editor') shell.openPath(filePath);
                return { success: true, filePath };
            }
        }

        // HTML Export
        if (format === 'html') {
            const htmlContent = this.generateHtml(maskedVars);
            if (finalAction === 'browser') {
                openInBrowserWithLocalServer(htmlContent, 'text/html', 'export.html');
                return { success: true };
            }
            if (filePath) fs.writeFileSync(filePath, htmlContent, 'utf-8');
            if (finalAction === 'editor' && filePath) shell.openPath(filePath);
            return { success: true, filePath };
        }

        // PDF Export — open in browser
        if (format === 'pdf') {
            const htmlContent = this.generateHtml(maskedVars);
            if (finalAction === 'browser') {
                openInBrowserWithLocalServer(htmlContent, 'text/html', 'export.pdf.html');
                return { success: true };
            }
            if (filePath) fs.writeFileSync(filePath, htmlContent, 'utf-8');
            if (finalAction === 'editor' && filePath) shell.openPath(filePath);
            return { success: true, filePath };
        }



        return { success: false, error: 'Unsupported format or missing parameters' };
    }

    private static generateScript(maskedVars: any[], mode: string, extraParam: string): string {
        if (mode === 'appsettings') {
            const [env, includePrefixStr] = (extraParam || '').split('|');
            const includePrefix = includePrefixStr !== 'false';
            
            const data: any = {};
            maskedVars.forEach(v => {
                let name = v.name;
                if (!includePrefix) {
                    const parts = name.split(/__|:/).filter((p: string) => !!p);
                    if (parts.length > 1) name = parts.slice(1).join('__');
                }
                
                const val = v.value;
                const pathParts = name.split(/__|:/).filter((p: string) => !!p);
                let curr = data;
                for (let i = 0; i < pathParts.length; i++) {
                    const seg = pathParts[i];
                    if (i === pathParts.length - 1) {
                        curr[seg] = val;
                    } else {
                        if (!curr[seg] || typeof curr[seg] !== 'object') curr[seg] = {};
                        curr = curr[seg];
                    }
                }
            });

            const convertToArray = (obj: any): any => {
                if (obj === null || typeof obj !== 'object') return obj;
                const keys = Object.keys(obj);
                const isAllNumeric = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
                if (isAllNumeric) {
                    const sortedKeys = keys.map(Number).sort((a,b) => a-b);
                    const minKey = sortedKeys[0];
                    const arr: any[] = [];
                    keys.forEach(k => {
                        const index = parseInt(k, 10);
                        const arrayIdx = minKey === 1 ? index - 1 : index;
                        if (arrayIdx >= 0) arr[arrayIdx] = convertToArray(obj[k]);
                    });
                    return arr;
                }
                Object.keys(obj).forEach(k => { obj[k] = convertToArray(obj[k]); });
                return obj;
            };

            const finalData = convertToArray(data);
            return JSON.stringify(finalData, null, 2) + '\n';
        }

        let [targetOs, winCmd] = (mode === 'standard' || mode === 'aws' || mode === 'azure' || mode === 'terraform') 
            ? (extraParam || '|').split('|') 
            : [os.platform() === 'win32' ? 'windows' : 'linux', 'set'];
        
        targetOs = targetOs || (os.platform() === 'win32' ? 'windows' : 'linux');
        winCmd = winCmd || 'set';
        const isWin = targetOs === 'windows';
        const lines: string[] = [];

        if (isWin && mode === 'standard') lines.push('@echo off');
        if (mode === 'github') {
            lines.push('echo Y | gh auth login --web --git-protocol https\n');
        }

        if (!isWin && mode === 'standard') {
            lines.push('cat <<EOF >> ~/.bashrc');
        }

        maskedVars.forEach(v => {
            const name = v.name;
            const val = v.value;
            let line = '';

            if (mode === 'standard') {
                if (isWin) {
                    if (winCmd === 'setx') line = `setx ${name} "${val}"`;
                    else if (winCmd === 'powershell') line = `[Environment]::SetEnvironmentVariable("${name}", "${val}", "User")`;
                    else line = `set "${name}=${val}"`;
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

            lines.push(line);
        });

        if (!isWin && mode === 'standard') {
            lines.push('EOF\nsource ~/.bashrc');
        }

        // Pause for better feedback
        if (mode !== 'terraform' && (isWin || mode !== 'standard')) {
            lines.push('');
            if (isWin) {
                if (winCmd === 'powershell') lines.push('Read-Host "Press any key to provide feedback and exit..."');
                else lines.push('pause');
            } else {
                lines.push('read -p "Press any key to provide feedback and exit..."');
            }
        }

        return lines.join('\n');
    }

    private static generateHtml(maskedVars: any[]): string {
        let rows = '';
        let currentGroup: string | null = null;
        maskedVars.forEach(v => {
            if (v.groupName !== currentGroup) {
                currentGroup = v.groupName;
                rows += `<tr class="group-header"><td colspan="2">${(currentGroup || 'Ungrouped').toUpperCase()}</td></tr>`;
            }
            rows += `<tr><td class="var-name">${v.name}</td><td class="var-value">${v.value}</td></tr>`;
        });

        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Export</title>
        <style>
            body { font-family: sans-serif; background: #f8fafc; padding: 40px; }
            .table-card { background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px 20px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            .group-header { background: #f1f5f9; color: #6366f1; font-weight: bold; font-size: 12px; letter-spacing: 0.1em; }
            .var-name { font-family: monospace; font-weight: 600; width: 30%; }
            .var-value { font-family: monospace; color: #64748b; }
        </style></head><body><div class="table-card"><table>${rows}</table></div></body></html>`;
    }
}

