const { spawn } = require('child_process');

const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');

// The user has ELECTRON_RUN_AS_NODE set in their system environment,
// which causes Electron to run as a pure Node.js background process,
// breaking `require('electron')`. We must completely delete it.
delete process.env.ELECTRON_RUN_AS_NODE;

function launchElectron() {
    console.log('Launching Electron...');
    
    // Launch Electron with the clean environment
    const electronProc = spawn('npx', ['electron', '.'], {
        stdio: 'inherit',
        shell: true,
        env: process.env
    });
    
    electronProc.on('close', (elCode) => {
        process.exit(elCode);
    });
}

if (skipBuild) {
    launchElectron();
} else {
    console.log('Starting build process...');

    const buildProc = spawn('npm', ['run', 'prebuild'], { 
        stdio: 'inherit', 
        shell: true, 
        env: process.env 
    });

    buildProc.on('close', (code) => {
        if (code !== 0) {
            console.error(`Build process exited with code ${code}`);
            process.exit(code);
        }
        
        launchElectron();
    });
}
