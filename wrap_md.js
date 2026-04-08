const fs = require('fs');
try {
  const content = fs.readFileSync('src/main.ts', 'utf8');
  fs.writeFileSync('main_contents.md', '```typescript\n' + content + '\n```');
  console.log('Successfully wrote main_contents.md');
} catch (e) {
  console.error(e);
}
