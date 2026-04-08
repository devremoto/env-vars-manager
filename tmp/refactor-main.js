const fs = require('fs');
const path = require('path');

const content = `import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { initDB } from './db';
import { PathService } from './services/path-service';
import { IpcManager } from './ipc-manager';

try {
    require('electron-reloader')(module, {
        debug: true,
        watchRenderer: true,
        ignore: [/main\\.js$/, /protected-vars\\.json$/]
    });
} catch (err) {
    console.error('electron-reloader error:', err);
}

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Environment Variables Manager',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0a0a1a',
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (mainWindow) {
        IpcManager.register(mainWindow);
    }
}

app.on('ready', () => {
    PathService.initialize();
});

app.whenReady().then(async () => {
    await initDB();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
`;

fs.writeFileSync('d:/desenvolvimento/node/env-vars/src/main.ts', content, 'utf-8');
console.log('Successfully refactored main.ts');
