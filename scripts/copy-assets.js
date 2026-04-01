const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const rendererSrc = path.join(__dirname, '..', 'src', 'renderer');
const rendererDest = path.join(__dirname, '..', 'dist', 'renderer');

// Copy HTML and CSS files
if (fs.existsSync(rendererSrc)) {
  const files = fs.readdirSync(rendererSrc);
  if (!fs.existsSync(rendererDest)) {
    fs.mkdirSync(rendererDest, { recursive: true });
  }
  for (const file of files) {
    if (file.endsWith('.html') || file.endsWith('.css')) {
      fs.copyFileSync(
        path.join(rendererSrc, file),
        path.join(rendererDest, file)
      );
    }
  }
}

console.log('Assets copied successfully.');
