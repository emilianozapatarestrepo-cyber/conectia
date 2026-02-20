#!/usr/bin/env node
/**
 * Phase 0 Validation — Full Test Suite Runner with Embedded PostgreSQL
 *
 * Creates a non-superuser role (conectia_app) to ensure RLS enforcement,
 * applies migrations as superuser, then runs tests as the app role.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const EmbeddedPostgres = require('embedded-postgres').default;

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '..');

const PG_PORT = 54322;
const PG_USER = 'postgres';
const PG_PASS = 'postgres';
const PG_DB = 'conectia_test';

// App user — non-superuser, subject to RLS
const APP_USER = 'conectia_app';
const APP_PASS = 'conectia_app_pw';

const SUPER_URL = `postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}`;
const APP_URL = `postgresql://${APP_USER}:${APP_PASS}@localhost:${PG_PORT}/${PG_DB}`;

let pg;

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 0 VALIDATION — FULL TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Start embedded PostgreSQL
  console.log('[1/3] Starting embedded PostgreSQL...');
  pg = new EmbeddedPostgres({
    databaseDir: join(BACKEND_DIR, '.pg-test-data'),
    user: PG_USER,
    password: PG_PASS,
    port: PG_PORT,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  console.log(`      PostgreSQL running on port ${PG_PORT}`);

  try {
    await pg.createDatabase(PG_DB);
    console.log(`      Database '${PG_DB}' created`);
  } catch (e) {
    console.log(`      Database '${PG_DB}' may already exist`);
  }

  // 2. Apply migrations as superuser, then create app role
  console.log('\n[2/3] Applying migrations & creating app role...');
  const pgLib = require('pg');
  const client = new pgLib.Client({ connectionString: SUPER_URL });
  await client.connect();

  await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

  const migrations = [
    '001_init_financial_ledger.sql',
    '002_tenant_ledger_state.sql',
    '003_tenant_memberships_and_rls.sql',
  ];

  for (const mig of migrations) {
    const sqlPath = join(BACKEND_DIR, 'migrations', mig);
    const sqlContent = readFileSync(sqlPath, 'utf8');
    try {
      await client.query(sqlContent);
      console.log(`      Applied: ${mig}`);
    } catch (e) {
      console.log(`      ${mig}: ${e.message.split('\n')[0]}`);
      try { await client.query('ROLLBACK'); } catch {}
    }
  }

  // Create non-superuser role for the application
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER}') THEN
          CREATE ROLE ${APP_USER} WITH LOGIN PASSWORD '${APP_PASS}';
        END IF;
      END
      $$;
    `);
    // Grant permissions on all tables, sequences, functions
    await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${APP_USER};`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${APP_USER};`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${APP_USER};`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER};`);
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${APP_USER};`);
    // Make trigger functions SECURITY DEFINER so they bypass RLS when called outside tenant context
    await client.query(`ALTER FUNCTION fn_create_ledger_state() SECURITY DEFINER;`);
    await client.query(`ALTER FUNCTION fn_seed_chart_of_accounts(UUID) SECURITY DEFINER;`);
    await client.query(`ALTER FUNCTION fn_verify_double_entry_balance() SECURITY DEFINER;`);
    await client.query(`ALTER FUNCTION fn_block_ledger_update() SECURITY DEFINER;`);
    await client.query(`ALTER FUNCTION fn_block_ledger_delete() SECURITY DEFINER;`);
    await client.query(`ALTER FUNCTION fn_block_closed_period() SECURITY DEFINER;`);
    console.log(`      App role '${APP_USER}' created (non-superuser, RLS enforced)`);
  } catch (e) {
    console.log(`      Role setup: ${e.message.split('\n')[0]}`);
  }

  await client.end();

  // 3. Run test suite as app user (RLS enforced)
  console.log('\n[3/3] Running full test suite as non-superuser...\n');

  const testEnv = {
    ...process.env,
    DATABASE_URL: APP_URL,
    FIREBASE_PROJECT_ID: 'test-project',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DB_POOL_MIN: '2',
    DB_POOL_MAX: '20',
    DB_SSL: '',
  };

  let testsPassed = true;
  try {
    execSync(
      'npx vitest run --reporter=verbose --reporter=json --outputFile.json=test-results.json',
      {
        cwd: BACKEND_DIR,
        stdio: 'inherit',
        env: testEnv,
        timeout: 600_000,
      }
    );
  } catch (e) {
    console.error('\n[ERROR] Test suite exited with code:', e.status);
    testsPassed = false;
  }

  // Parse JSON results
  console.log('\n  Verifying zero skipped tests...\n');
  try {
    const jsonContent = readFileSync(join(BACKEND_DIR, 'test-results.json'), 'utf8');
    const result = JSON.parse(jsonContent);
    const skipped = result.numSkippedTests || 0;
    const total = result.numTotalTests || 0;
    const passed = result.numPassedTests || 0;
    const failed = result.numFailedTests || 0;

    console.log('  ┌─────────────────────────────────┐');
    console.log('  │       TEST RESULTS SUMMARY       │');
    console.log('  ├─────────────────────────────────┤');
    console.log(`  │ Total:   ${String(total).padStart(6)}                │`);
    console.log(`  │ Passed:  ${String(passed).padStart(6)}                │`);
    console.log(`  │ Failed:  ${String(failed).padStart(6)}                │`);
    console.log(`  │ Skipped: ${String(skipped).padStart(6)}                │`);
    console.log('  └─────────────────────────────────┘');

    if (skipped > 0) {
      console.error('\n  *** ZERO SKIPPED TESTS POLICY VIOLATION ***');
      testsPassed = false;
    }
  } catch {
    console.warn('  (JSON results file not found — relying on verbose output)');
  }

  await cleanup();

  if (!testsPassed) {
    process.exit(1);
  }

  console.log('\n  Phase 0 validation: ALL CLEAR');
}

async function cleanup() {
  if (pg) {
    console.log('\n  Stopping PostgreSQL...');
    try { await pg.stop(); } catch {}
  }
}

process.on('SIGINT', async () => { await cleanup(); process.exit(1); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(1); });

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await cleanup();
  process.exit(1);
});
