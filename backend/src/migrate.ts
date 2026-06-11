/**
 * Conectia Database Migration Runner
 *
 * Reads all .sql files from migrations/ in alphabetical order,
 * tracks applied versions in schema_migrations, and applies only new ones.
 * Safe to run multiple times (idempotent).
 *
 * Usage: tsx src/migrate.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is required');
  process.exit(1);
}

// Migrations live at <project-root>/migrations/ relative to cwd (package.json dir)
const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations');

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('[migrate] Connected to database');

  try {
    // Create tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Load applied versions
    const { rows: applied } = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedSet = new Set(applied.map((r) => r.version));

    // Collect and sort migration files
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('[migrate] No migration files found in', MIGRATIONS_DIR);
      return;
    }

    let applied_count = 0;
    let skipped_count = 0;

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');

      if (appliedSet.has(version)) {
        console.log(`[migrate] SKIP  ${file} (already applied)`);
        skipped_count++;
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      console.log(`[migrate] APPLY ${file}…`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
        await client.query('COMMIT');
        console.log(`[migrate] OK    ${file}`);
        applied_count++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }

    console.log(
      `\n[migrate] Done. Applied: ${applied_count}, Skipped (already applied): ${skipped_count}`
    );
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('[migrate] FATAL:', err.message);
  process.exit(1);
});
