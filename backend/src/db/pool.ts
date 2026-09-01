import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://lms:lms@localhost:5432/lms',
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
