const fs = require('fs');
const buf = fs.readFileSync('src/main.ts');
console.log('Size:', buf.length);
console.log('First bytes hex:', buf.slice(0,6).toString('hex'));
console.log('Has UTF-16LE BOM:', buf[0] === 0xFF && buf[1] === 0xFE);
console.log('Has UTF-8 BOM:', buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF);
