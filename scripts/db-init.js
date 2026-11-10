// npm run db:init — creates the tables/indexes once (safe to re-run).
// Optional: the app also creates the schema lazily on the first request after a cold start.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const { ensureSchema, closePool, isDbConfigured, SCHEMA_SQL, getPool } = await import('../lib/db.js');

if (!isDbConfigured()) {
  console.error('Set DATABASE_URL (or DATA_BASE_URL / POSTGRES_URL) in .env first.');
  process.exit(1);
}

try {
  // Run the DDL unconditionally (ensureSchema skips it when the schema already looks complete),
  // so re-running db:init also adds any index/table that might be missing.
  await getPool().query(SCHEMA_SQL);
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1::text[]) ORDER BY table_name`,
    [['trips', 'members', 'categories', 'expenses', 'contributions', 'bills', 'activity_log']]
  );
  console.log(`Schema ready (${rows.map((r) => r.table_name).join(', ')}).`);
} catch (err) {
  console.error('Schema setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
