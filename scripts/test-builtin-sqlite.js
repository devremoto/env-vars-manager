try {
    const sqlite = require('node:sqlite');
    console.log('SUCCESS: node:sqlite found');
    const db = new sqlite.DatabaseSync(':memory:');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    console.log('SUCCESS: DatabaseSync works');
} catch (e) {
    console.log('FAILURE: ' + e.message);
}
