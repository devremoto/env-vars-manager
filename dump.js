const fs = require('fs');
const content = fs.readFileSync('src/main.ts', 'utf8');
fs.writeFileSync('main_content.json', JSON.stringify({text: content}, null, 2));
process.exit(0);
