try {
    const Database = require('better-sqlite3');
    console.log('SUCCESS: better-sqlite3 found');
} catch (e) {
    console.log('FAILURE: ' + e.message);
}
