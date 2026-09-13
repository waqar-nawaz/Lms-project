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

  // Phase 2+ incremental migrations use IF NOT EXISTS throughout, so they're
  // safe to run on every deploy regardless of whether the base schema is new
  // or already existed.
  const phase2Path = path.join(__dirname, 'migrations_002_phase2.sql');
  if (fs.existsSync(phase2Path)) {
    const phase2Sql = fs.readFileSync(phase2Path, 'utf-8');
    await pool.query(phase2Sql);
    console.log('Phase 2 migration applied (idempotent).');
  }

  await pool.end();
}

migrate().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
