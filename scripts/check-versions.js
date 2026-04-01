const { app } = require('electron');
app.whenReady().then(() => {
    console.log('Electron version:', process.versions.electron);
    console.log('Node version in Electron:', process.versions.node);
    app.quit();
});
