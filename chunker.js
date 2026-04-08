const fs = require('fs');
const content = fs.readFileSync('src/main.ts', 'utf8');
console.log(content.length);
fs.writeFileSync('src/main_chunk1.txt', content.substring(0, 10000));
fs.writeFileSync('src/main_chunk2.txt', content.substring(10000, 20000));
fs.writeFileSync('src/main_chunk3.txt', content.substring(20000, 30000));
fs.writeFileSync('src/main_chunk4.txt', content.substring(30000));
