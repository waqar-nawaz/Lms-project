import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { pool, query } from './pool';

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
  }
}

async function seed() {
  const existing = await query(`SELECT id FROM organizations WHERE code = 'DEMO'`);
  if (existing.rows.length) {
    console.log('Demo data already seeded — skipping.');
    return;
  }

  const orgRes = await query(
    `INSERT INTO organizations (name, code) VALUES ('Demo Diagnostics Lab', 'DEMO') RETURNING id`
  );
  const orgId = orgRes.rows[0].id;

  const branchRes = await query(
    `INSERT INTO branches (organization_id, name, code, address) VALUES ($1, 'Main Branch', 'MAIN', 'Islamabad') RETURNING id`,
    [orgId]
  );
  const branchId = branchRes.rows[0].id;

  const users = [
    { name: 'Admin User', email: 'admin@demo.lab', role: 'super_admin' },
    { name: 'Lab Manager', email: 'manager@demo.lab', role: 'lab_manager' },
    { name: 'Front Desk', email: 'reception@demo.lab', role: 'receptionist' },
    { name: 'Sample Collector', email: 'phlebotomist@demo.lab', role: 'phlebotomist' },
    { name: 'Lab Tech', email: 'tech@demo.lab', role: 'lab_technician' },
    { name: 'Dr Reviewer', email: 'pathologist@demo.lab', role: 'pathologist' },
    { name: 'Billing Clerk', email: 'accountant@demo.lab', role: 'accountant' },
  ];
  const passwordHash = await bcrypt.hash('password123', 10);
  for (const u of users) {
    await query(
      `INSERT INTO users (branch_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5)`,
      [branchId, u.name, u.email, passwordHash, u.role]
    );
  }

  const deptRes = await query(
    `INSERT INTO departments (branch_id, name, code) VALUES ($1, 'Hematology', 'HEMA') RETURNING id`,
    [branchId]
  );
  const deptId = deptRes.rows[0].id;

  await query(
    `INSERT INTO doctors (branch_id, name, specialty, phone) VALUES ($1, 'Dr. Ahmed Khan', 'General Physician', '0300-0000000')`,
    [branchId]
  );

  const testRes = await query(
    `INSERT INTO tests (department_id, code, name, short_name, specimen_type, price, tat_minutes)
     VALUES ($1, 'CBC', 'Complete Blood Count', 'CBC', 'blood', 800, 120) RETURNING id`,
    [deptId]
  );
  const testId = testRes.rows[0].id;

  const params = [
    { code: 'HGB', name: 'Hemoglobin', unit: 'g/dL', low_m: 13, high_m: 17, low_f: 12, high_f: 15 },
    { code: 'WBC', name: 'White Blood Cell Count', unit: '10^3/uL', low_m: 4, high_m: 11, low_f: 4, high_f: 11 },
    { code: 'PLT', name: 'Platelet Count', unit: '10^3/uL', low_m: 150, high_m: 410, low_f: 150, high_f: 410 },
  ];
  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    const paramRes = await query(
      `INSERT INTO test_parameters (test_id, code, name, result_type, unit, display_order)
       VALUES ($1,$2,$3,'numeric',$4,$5) RETURNING id`,
      [testId, p.code, p.name, p.unit, i]
    );
    const paramId = paramRes.rows[0].id;
    await query(
      `INSERT INTO reference_ranges (parameter_id, gender, low, high, critical_low, critical_high)
       VALUES ($1,'male',$2,$3,$4,$5)`,
      [paramId, p.low_m, p.high_m, p.low_m * 0.5, p.high_m * 1.5]
    );
    await query(
      `INSERT INTO reference_ranges (parameter_id, gender, low, high, critical_low, critical_high)
       VALUES ($1,'female',$2,$3,$4,$5)`,
      [paramId, p.low_f, p.high_f, p.low_f * 0.5, p.high_f * 1.5]
    );
  }

  console.log('Seed complete.');
  console.log('Login with any of these (password: password123):');
  users.forEach((u) => console.log(`  ${u.email}  [${u.role}]`));
}

async function main() {
  await migrate();
  await seed();
  await pool.end();
}

main().catch((e) => {
  console.error('Bootstrap failed:', e.message);
  process.exit(1);
});
