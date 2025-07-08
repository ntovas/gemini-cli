import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

// Open the database
const db = new Database('htb-knowledge.db', { readonly: true });

// Load sqlite-vec extension
sqliteVec.load(db);

// Check counts
const docCount = db.prepare('SELECT COUNT(*) as count FROM documents').get();
const vecCount = db.prepare('SELECT COUNT(*) as count FROM vec_documents').get();

console.log('Documents in database:', docCount.count);
console.log('Vectors in database:', vecCount.count);

// Test a simple query
const testQuery = db.prepare('SELECT * FROM documents LIMIT 5').all();
console.log('\nFirst 5 documents:');
testQuery.forEach((doc, i) => {
  console.log(`${i + 1}. ${doc.title} (${doc.category})`);
});

// Close database
db.close(); 