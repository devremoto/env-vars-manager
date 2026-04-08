import * as os from 'os';

export function expandEnvVars(pathStr: string): string {
    if (!pathStr) return pathStr;
    const platform = os.platform();
    if (platform === 'win32') {
        return pathStr.replace(/%([^%]+)%/g, (_, name) => {
            return process.env[name] || process.env[name.toUpperCase()] || `%${name}%`;
        });
    } else {
        let expanded = pathStr.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
            return process.env[name] || `$${name}`;
        });
        expanded = expanded.replace(/\$\{([^}]+)\}/g, (_, name) => {
            return process.env[name] || `\${${name}}`;
        });
        return expanded;
    }
}
