import fs from 'fs';
import path from 'path';
import { pool } from './pool';

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  try {
    await pool.query(sql);
    console.log('Migration applied successfully.');
  } catch (e: any) {
    if (e.code === '42P07') {
      console.log('Tables already exist — schema already migrated.');
    } else {
      throw e;
    }
  } finally {
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
