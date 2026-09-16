import fs from 'fs';
import path from 'path';
import { pool } from './pool';

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  try {
    await pool.query(sql);
    console.log('Base schema applied successfully.');
  } catch (e: any) {
    if (e.code === '42P07') {
      console.log('Tables already exist — base schema already migrated.');
    } else {
      throw e;
    }
  }

  // Incremental migrations use IF NOT EXISTS throughout, so they're safe to
  // run on every deploy regardless of whether the base schema is new or
  // already existed.
  const incrementalFiles = ['migrations_002_phase2.sql', 'migrations_003_phase3.sql'];
  for (const file of incrementalFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      await pool.query(fs.readFileSync(filePath, 'utf-8'));
      console.log(`${file} applied (idempotent).`);
    }
  }

  await pool.end();
}

migrate().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
