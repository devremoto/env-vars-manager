const { exec } = require('child_process');
const os = require('os');

function parseRegistryOutputToEnvVars(output, isSystem) {
    if (!output) return [];
    const vars = [];
    const lines = output.split(/\r?\n/).filter((line) => line.trim());

    for (const line of lines) {
        // Match name, type, and value. Value can be empty.
        const match = line.match(/^\s+(\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/);
        if (match) {
            vars.push({ name: match[1], value: match[2] || '', isSystem });
        }
    }
    return vars;
}

const userCmd = 'reg query "HKCU\\Environment"';
const systemCmd = 'reg query "HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\Environment"';

console.log('--- Testing User Reg Query ---');
exec(userCmd, (err, stdout, stderr) => {
    if (err) {
        console.error('User Query Error:', err);
    }
    console.log('User Stdout Type:', typeof stdout);
    console.log('User Stdout Length:', stdout.length);
    const userVars = parseRegistryOutputToEnvVars(stdout, false);
    console.log('User Vars Count:', userVars.length);
    if (userVars.length > 0) console.log('First User Var:', userVars[0]);

    console.log('\n--- Testing System Reg Query ---');
    exec(systemCmd, (err, stdout, stderr) => {
        if (err) {
            console.error('System Query Error:', err);
        }
        const sysVars = parseRegistryOutputToEnvVars(stdout, true);
        console.log('System Vars Count:', sysVars.length);
        if (sysVars.length > 0) console.log('First System Var:', sysVars[0]);
    });
});
