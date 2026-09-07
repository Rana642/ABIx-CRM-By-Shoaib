import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
  const { rows } = await pool.query(
    `SELECT id, name, slug, entity_type, parent_id, status
     FROM companies
     ORDER BY entity_type = 'portfolio' DESC, name ASC`
  );
  return NextResponse.json(rows);
}
