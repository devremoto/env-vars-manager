const fs = require('fs');
const content = fs.readFileSync('src/main.ts', 'utf8');
fs.writeFileSync('src/main_copy.txt', content);
