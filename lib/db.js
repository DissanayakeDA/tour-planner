// Postgres access: one small pg Pool per process (module scope, created lazily so
// process.env is read at call time), type parsers, query/tx helpers and ensureSchema().
import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions/db-connections';
import { httpError } from './validate.js';

const { Pool, types } = pg;

// NUMERIC -> JS number, INT8 (COUNT/SUM of ints) -> JS number, DATE -> keep 'YYYY-MM-DD'.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(1082, (v) => v);

/** Pooled connection string from env, or null. */
export function connectionString() {
  const raw = process.env.DATABASE_URL || process.env.DATA_BASE_URL || process.env.POSTGRES_URL;
  if (!raw) return null;
  // pg treats sslmode=require|prefer|verify-ca as verify-full anyway but prints a SECURITY WARNING
  // for them; say verify-full explicitly (same behaviour, no warning). Leave libpq-compat URLs alone.
  if (/[?&]uselibpqcompat=true(&|$)/i.test(raw)) return raw;
  return raw.replace(/([?&])sslmode=(require|prefer|verify-ca)(?=&|$)/i, '$1sslmode=verify-full');
}

export const isDbConfigured = () => Boolean(connectionString());

let pool = null;

export function getPool() {
  if (pool) return pool;
  const url = connectionString();
  if (!url) {
    throw httpError(503, 'Database is not configured on the server. Set DATABASE_URL (or DATA_BASE_URL).');
  }
  pool = new Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 10_000, // Neon free tier may need a moment to wake up
    idleTimeoutMillis: 5_000, // Vercel's guidance for Fluid compute: short idle timeout
    // Neon URLs carry channel_binding=require; pg only honours it through this flag.
    enableChannelBinding: /[?&]channel_binding=require(&|$)/i.test(url),
  });
  // An idle client erroring (e.g. Neon closing it) must not crash the process.
  pool.on('error', (err) => console.error('Postgres pool error:', err.message));
  try {
    // On Vercel Fluid compute this keeps the instance alive just long enough to close idle
    // connections cleanly before suspension. It is a no-op outside Vercel.
    attachDatabasePool(pool);
  } catch (err) {
    console.warn('attachDatabasePool unavailable:', err.message);
  }
  return pool;
}

export async function closePool() {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

// ---------- schema ----------

export const SCHEMA_SQL = `
SELECT pg_advisory_xact_lock(8727301);  -- serialise concurrent cold starts creating the schema

CREATE TABLE IF NOT EXISTS trips (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT,
  start_date  DATE,
  end_date    DATE,
  currency    TEXT NOT NULL DEFAULT 'LKR',
  budget      NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id         SERIAL PRIMARY KEY,
  trip_id    INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id      SERIAL PRIMARY KEY,
  trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  budget  NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- paid_by NULL = paid from the common trip fund.
-- paid_by uses the default NO ACTION (not RESTRICT) so deleting a trip can cascade.
CREATE TABLE IF NOT EXISTS expenses (
  id          SERIAL PRIMARY KEY,
  trip_id     INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  paid_by     INT REFERENCES members(id),
  title       TEXT NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  date        DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- money a member put into the common fund
CREATE TABLE IF NOT EXISTS contributions (
  id         SERIAL PRIMARY KEY,
  trip_id    INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id  INT NOT NULL REFERENCES members(id),
  amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  date       DATE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id            SERIAL PRIMARY KEY,
  expense_id    INT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  public_id     TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL,
  format        TEXT,
  original_name TEXT,
  bytes         INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS members_trip_id_idx        ON members (trip_id);
CREATE INDEX IF NOT EXISTS categories_trip_id_idx     ON categories (trip_id);
CREATE INDEX IF NOT EXISTS expenses_trip_id_idx       ON expenses (trip_id);
CREATE INDEX IF NOT EXISTS expenses_category_id_idx   ON expenses (category_id);
CREATE INDEX IF NOT EXISTS expenses_paid_by_idx       ON expenses (paid_by);
CREATE INDEX IF NOT EXISTS contributions_trip_id_idx  ON contributions (trip_id);
CREATE INDEX IF NOT EXISTS contributions_member_id_idx ON contributions (member_id);
CREATE INDEX IF NOT EXISTS bills_expense_id_idx       ON bills (expense_id);

-- v2.1: team size, who-did-what columns, Cloudinary version, activity log.
-- ADD COLUMN IF NOT EXISTS keeps this safe to run on databases created by earlier versions.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS team_size        INT NOT NULL DEFAULT 0 CHECK (team_size >= 0),
  ADD COLUMN IF NOT EXISTS created_by_name  TEXT,
  ADD COLUMN IF NOT EXISTS created_by_phone TEXT;
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS created_by_name  TEXT,
  ADD COLUMN IF NOT EXISTS created_by_phone TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_name  TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_phone TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ;
ALTER TABLE contributions
  ADD COLUMN IF NOT EXISTS created_by_name  TEXT,
  ADD COLUMN IF NOT EXISTS created_by_phone TEXT;
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS version           BIGINT,
  ADD COLUMN IF NOT EXISTS uploaded_by_name  TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by_phone TEXT;

-- trip_id deliberately has no foreign key: the log outlives a deleted trip, so you can still see who deleted it.
CREATE TABLE IF NOT EXISTS activity_log (
  id          SERIAL PRIMARY KEY,
  trip_id     INT,
  trip_name   TEXT,
  actor_name  TEXT NOT NULL,
  actor_phone TEXT NOT NULL,
  action      TEXT NOT NULL,   -- create | update | delete | upload
  entity      TEXT NOT NULL,   -- trip | member | category | expense | bill | contribution
  entity_id   INT,
  summary     TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_log_trip_idx ON activity_log (trip_id, id DESC);
`;

// The DDL above runs as ONE implicit transaction (multi-statement simple query), so if its last
// object exists the whole schema exists. Checking that first avoids taking DDL locks on every cold start.
// Bump the sentinel to the newest object whenever the schema grows.
const SCHEMA_SENTINEL = `SELECT to_regclass('activity_log_trip_idx') IS NOT NULL AS ready`;

// Errors two cold starts can hit when racing CREATE ... IF NOT EXISTS (the advisory lock makes this rare).
const RACE_CODES = new Set(['23505', '42P07', '42710', '40P01']);

async function createSchema() {
  const client = await getPool().connect();
  let broken = null;
  try {
    const { rows } = await client.query(SCHEMA_SENTINEL);
    if (rows[0]?.ready) return;
    try {
      await client.query(SCHEMA_SQL);
    } catch (err) {
      if (!RACE_CODES.has(err.code)) throw err;
      await client.query(SCHEMA_SQL); // the other instance finished first; this is now a no-op
    }
  } catch (err) {
    broken = err;
    throw err;
  } finally {
    client.release(broken ?? undefined); // a client that errored mid-DDL is discarded, not reused
  }
}

let schemaPromise = null;
let schemaReady = false;

/** Creates the schema once per process. On failure the memo is reset so the next call retries. */
export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = createSchema().then(
      () => {
        schemaReady = true;
      },
      (err) => {
        schemaPromise = null;
        throw err;
      }
    );
  }
  return schemaPromise;
}

// ---------- query helpers ----------

/** Run one parameterised statement on the pool ($1, $2 ... placeholders only). */
export async function query(text, params = []) {
  if (!schemaReady) await ensureSchema();
  return getPool().query(text, params);
}

/**
 * Run fn(client) inside BEGIN/COMMIT on one dedicated client; ROLLBACK on any error.
 * The client is always released (and discarded if ROLLBACK itself failed).
 */
export async function tx(fn) {
  if (!schemaReady) await ensureSchema();
  const client = await getPool().connect();
  let broken = null;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      broken = rollbackErr;
    }
    throw err;
  } finally {
    client.release(broken ?? undefined);
  }
}
