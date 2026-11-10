// Trip Kitty API: every /api/* route, framework-independent. app/api/[...path]/route.js (Next.js)
// hands each request to dispatch() at the bottom of this file.
//
// There is no login. Instead every change must carry body.actor = {name, phone}; the change and
// an activity_log row recording who made it are written in ONE transaction.
import crypto from 'node:crypto';
import { query, tx } from './db.js';
import * as cld from './cloudinary.js';
import { summarize } from './summary.js';
import { logActivity, diff, fmtMoney, ACTIVITY_COLUMNS } from './activity.js';
import {
  HttpError,
  httpError,
  bodyOf,
  idParam,
  isPlainObject,
  text,
  money,
  int,
  dateStr,
  currency,
  optionalRef,
  payerRef,
  actorOf,
} from './validate.js';

const MAX_FILES = 10;
const MAX_TEAM = 1000;
const DEFAULT_CATEGORIES = ['Transport', 'Accommodation', 'Food & Drinks', 'Activities & Tickets', 'Other'];

const q = (s) => `“${s}”`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const short = (v) => (v == null || v === '' ? '(empty)' : String(v).length > 60 ? `${String(v).slice(0, 57)}…` : String(v));

// ---------- data access ----------

async function tripDetail(id) {
  const [t, members, categories, expenses, bills, contributions, activity] = await Promise.all([
    query('SELECT * FROM trips WHERE id = $1', [id]),
    query('SELECT * FROM members WHERE trip_id = $1 ORDER BY lower(name), id', [id]),
    query('SELECT * FROM categories WHERE trip_id = $1 ORDER BY id', [id]),
    query('SELECT * FROM expenses WHERE trip_id = $1 ORDER BY date DESC NULLS LAST, id DESC', [id]),
    query(
      'SELECT b.* FROM bills b JOIN expenses e ON e.id = b.expense_id WHERE e.trip_id = $1 ORDER BY b.id',
      [id]
    ),
    query('SELECT * FROM contributions WHERE trip_id = $1 ORDER BY date DESC NULLS LAST, id DESC', [id]),
    query(`SELECT ${ACTIVITY_COLUMNS} FROM activity_log WHERE trip_id = $1 ORDER BY id DESC LIMIT 10`, [id]),
  ]);
  const trip = t.rows[0];
  if (!trip) throw httpError(404, 'Trip not found');

  const billsByExpense = new Map();
  for (const b of bills.rows) {
    Object.assign(b, cld.billUrls(b));
    if (!billsByExpense.has(b.expense_id)) billsByExpense.set(b.expense_id, []);
    billsByExpense.get(b.expense_id).push(b);
  }
  for (const e of expenses.rows) e.bills = billsByExpense.get(e.id) ?? [];

  return {
    trip,
    members: members.rows,
    categories: categories.rows,
    expenses: expenses.rows,
    contributions: contributions.rows,
    recentActivity: activity.rows,
    summary: summarize(trip, members.rows, categories.rows, expenses.rows, contributions.rows),
  };
}

/** Locks and returns the trip row ({id, name, currency, ...}) inside a transaction, or 404. */
async function lockTrip(c, tripId) {
  const { rows } = await c.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [tripId]);
  if (!rows.length) throw httpError(404, 'Trip not found');
  return rows[0];
}

/** Locks one child row joined with its trip's name/currency, or 404. */
async function lockRow(c, table, id, label) {
  const { rows } = await c.query(
    `SELECT x.*, t.name AS trip_name, t.currency AS trip_currency
     FROM ${table} x JOIN trips t ON t.id = x.trip_id WHERE x.id = $1 FOR UPDATE OF x`,
    [id]
  );
  if (!rows.length) throw httpError(404, `${label} not found`);
  return rows[0];
}

/** Checks category / member ids belong to the trip and returns their names (for the log). */
async function refNames(c, tripId, { category = null, member = null, memberLabel = 'member' } = {}) {
  const { rows } = await c.query(
    `SELECT (SELECT name FROM categories WHERE id = $2::int AND trip_id = $1) AS category_name,
            (SELECT name FROM members    WHERE id = $3::int AND trip_id = $1) AS member_name`,
    [tripId, category, member]
  );
  const r = rows[0];
  if (category != null && r.category_name == null) throw httpError(400, 'Invalid category');
  if (member != null && r.member_name == null) throw httpError(400, `Invalid ${memberLabel}`);
  return r;
}

/** All category / member names of a trip (to describe before/after values in the log). */
async function nameMaps(c, tripId) {
  const [cats, mems] = await Promise.all([
    c.query('SELECT id, name FROM categories WHERE trip_id = $1', [tripId]),
    c.query('SELECT id, name FROM members WHERE trip_id = $1', [tripId]),
  ]);
  return {
    category: (id) => (id == null ? 'Uncategorized' : cats.rows.find((r) => r.id === id)?.name ?? `#${id}`),
    payer: (id) => (id == null ? 'Trip fund' : mems.rows.find((r) => r.id === id)?.name ?? `#${id}`),
    member: (id) => mems.rows.find((r) => r.id === id)?.name ?? `#${id}`,
  };
}

// ---------- field parsing ----------

function tripFields(b) {
  const start = dateStr(b.start_date, 'Start date');
  const end = dateStr(b.end_date, 'End date');
  if (start && end && end < start) throw httpError(400, 'End date cannot be before the start date');
  return {
    name: text(b.name, 'Trip name', 120, { required: true }),
    destination: text(b.destination, 'Destination', 120),
    start_date: start,
    end_date: end,
    currency: currency(b.currency),
    budget: money(b.budget, 'Total budget', { required: true, min: 0.01 }),
    team_size: int(b.team_size, 'Team member count', { required: true, min: 1, max: MAX_TEAM }),
    notes: text(b.notes, 'Notes', 2000),
  };
}

const memberFields = (b) => ({
  name: text(b.name, 'Name', 120, { required: true }),
  phone: text(b.phone, 'Phone', 40),
});
const categoryFields = (b) => ({
  name: text(b.name, 'Category name', 120, { required: true }),
  budget: money(b.budget, 'Budget'),
});

function expenseFields(b) {
  return {
    category_id: optionalRef(b.category_id, 'category'),
    paid_by: payerRef(b.paid_by),
    title: text(b.title, 'Description', 200, { required: true }),
    amount: money(b.amount, 'Amount', { required: true }),
    date: dateStr(b.date, 'Date'),
    notes: text(b.notes, 'Notes', 2000),
  };
}

function contributionFields(b) {
  const member = optionalRef(b.member_id, 'member');
  if (!member) throw httpError(400, 'Member is required');
  return {
    member_id: member,
    amount: money(b.amount, 'Amount', { required: true, min: 0.01 }),
    date: dateStr(b.date, 'Date'),
    note: text(b.note, 'Note', 2000),
  };
}

// ---------- bills (Cloudinary upload results) ----------

/**
 * Verifies the UploadResult objects the browser got back from Cloudinary.
 * Returns {bills, rejected}: rows for the genuine ones (deduplicated) and whether any failed.
 */
function verifyBills(list, tripId, { min }) {
  if (list == null) list = [];
  if (!Array.isArray(list)) throw httpError(400, 'bills must be a list');
  if (list.length < min) throw httpError(400, 'Attach at least one file');
  if (list.length > MAX_FILES) throw httpError(400, `You can attach at most ${MAX_FILES} files at a time`);
  if (!list.length) return { bills: [], rejected: false };
  if (!cld.isConfigured()) throw httpError(503, 'Cloudinary is not configured on the server, so receipts cannot be saved.');
  const bills = [];
  const seen = new Set();
  let rejected = false;
  for (const r of list) {
    if (!cld.verifyUploadResult(r, tripId)) {
      rejected = true;
    } else if (!seen.has(r.public_id)) {
      seen.add(r.public_id);
      bills.push(cld.billRow(r));
    }
  }
  return { bills, rejected };
}

const REJECTED_UPLOAD = 'A receipt upload could not be verified. Please upload the file again.';

async function insertBills(c, expenseId, bills, actor) {
  if (!bills.length) return;
  await c.query(
    `INSERT INTO bills (expense_id, url, version, public_id, resource_type, format, original_name, bytes,
                        uploaded_by_name, uploaded_by_phone)
     SELECT $1, u.url, u.version, u.public_id, u.resource_type, u.format, u.original_name, u.bytes, $9, $10
     FROM unnest($2::text[], $3::bigint[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[])
       AS u(url, version, public_id, resource_type, format, original_name, bytes)`,
    [
      expenseId,
      bills.map((b) => b.url),
      bills.map((b) => (Number.isSafeInteger(b.version) ? b.version : null)),
      bills.map((b) => b.public_id),
      bills.map((b) => b.resource_type),
      bills.map((b) => b.format),
      bills.map((b) => b.original_name),
      bills.map((b) => b.bytes),
      actor.name,
      actor.phone,
    ]
  );
}

/** Destroys uploaded assets after a failed save, except any that are already stored on an expense. */
async function discardUploads(bills) {
  if (!bills.length) return 0;
  try {
    const { rows } = await query('SELECT public_id FROM bills WHERE public_id = ANY($1::text[])', [
      bills.map((b) => b.public_id),
    ]);
    const inUse = new Set(rows.map((r) => r.public_id));
    const doomed = bills.filter((b) => !inUse.has(b.public_id));
    await cld.destroyAll(doomed);
    return doomed.length;
  } catch (err) {
    console.error('Could not clean up uploaded receipts:', err.message);
    return 0;
  }
}

// ---------- router ----------

const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
}

const created = (body) => ({ status: 201, body });

route('GET', '/config', async () => ({
  cloudinary: cld.isConfigured(),
  cloudName: cld.cloudName(),
  maxFileMb: cld.MAX_FILE_MB,
  pinRequired: Boolean((process.env.APP_PIN ?? '').trim()),
  actorRequired: true,
}));

// ----- trips -----

route('GET', '/trips', async (_req) => {
  const { rows } = await query(`
    SELECT t.*,
      (SELECT COUNT(*) FROM members m WHERE m.trip_id = t.id) AS member_count,
      (SELECT COUNT(*) FROM expenses e WHERE e.trip_id = t.id) AS expense_count,
      (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE e.trip_id = t.id) AS spent,
      CASE WHEN t.budget > 0 THEN t.budget
           ELSE (SELECT COALESCE(SUM(c.budget), 0) FROM categories c WHERE c.trip_id = t.id) END AS total_budget
    FROM trips t
    ORDER BY COALESCE(t.start_date::timestamptz, t.created_at) DESC, t.id DESC`);
  return rows;
});

route('POST', '/trips', async (req) => {
  const b = bodyOf(req);
  const f = tripFields(b);
  const actor = actorOf(b);
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO trips (name, destination, start_date, end_date, currency, budget, team_size, notes,
                          created_by_name, created_by_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [f.name, f.destination, f.start_date, f.end_date, f.currency, f.budget, f.team_size, f.notes, actor.name, actor.phone]
    );
    const tripId = rows[0].id;
    await c.query(
      `INSERT INTO categories (trip_id, name, budget)
       SELECT $1, d.name, 0 FROM unnest($2::text[]) WITH ORDINALITY AS d(name, ord) ORDER BY d.ord`,
      [tripId, DEFAULT_CATEGORIES]
    );
    await logActivity(c, {
      tripId,
      tripName: f.name,
      actor,
      action: 'create',
      entity: 'trip',
      entityId: tripId,
      summary: `Created trip ${q(f.name)}: total budget ${fmtMoney(f.budget, f.currency)}, team of ${f.team_size}`,
    });
    return tripId;
  });
  return created(await tripDetail(id));
});

route('GET', '/trips/:id', async (req) => {
  return await tripDetail(idParam(req, 'Trip'));
});

route('PUT', '/trips/:id', async (req) => {
  const id = idParam(req, 'Trip');
  const b = bodyOf(req);
  const f = tripFields(b);
  const actor = actorOf(b);
  await tx(async (c) => {
    const old = await lockTrip(c, id);
    await c.query(
      `UPDATE trips SET name = $1, destination = $2, start_date = $3, end_date = $4, currency = $5, budget = $6,
                        team_size = $7, notes = $8
       WHERE id = $9`,
      [f.name, f.destination, f.start_date, f.end_date, f.currency, f.budget, f.team_size, f.notes, id]
    );
    const m = (v) => fmtMoney(v, f.currency);
    const d = diff(old, f, [
      { key: 'name', label: 'name' },
      { key: 'destination', label: 'destination' },
      { key: 'start_date', label: 'start date' },
      { key: 'end_date', label: 'end date' },
      { key: 'currency', label: 'currency' },
      { key: 'budget', label: 'total budget', fmt: m },
      { key: 'team_size', label: 'team size' },
      { key: 'notes', label: 'notes', fmt: short },
    ]);
    if (d.text) {
      await logActivity(c, {
        tripId: id,
        tripName: f.name,
        actor,
        action: 'update',
        entity: 'trip',
        entityId: id,
        summary: `Updated trip details: ${d.text}`,
        details: { changes: d.changes },
      });
    }
  });
  return await tripDetail(id);
});

route('DELETE', '/trips/:id', async (req) => {
  const id = idParam(req, 'Trip');
  const actor = actorOf(bodyOf(req));
  const bills = await tx(async (c) => {
    const trip = await lockTrip(c, id);
    const { rows: counts } = await c.query(
      `SELECT (SELECT COUNT(*) FROM expenses WHERE trip_id = $1) AS expenses,
              (SELECT COUNT(*) FROM members WHERE trip_id = $1) AS members`,
      [id]
    );
    const { rows: deleted } = await c.query(
      `DELETE FROM bills b USING expenses e
       WHERE e.id = b.expense_id AND e.trip_id = $1
       RETURNING b.public_id, b.resource_type`,
      [id]
    );
    await c.query('DELETE FROM trips WHERE id = $1', [id]); // cascades the rest
    await logActivity(c, {
      tripId: id,
      tripName: trip.name,
      actor,
      action: 'delete',
      entity: 'trip',
      entityId: id,
      summary:
        `Deleted trip ${q(trip.name)} with ${plural(counts[0].expenses, 'expense')}, ` +
        `${plural(counts[0].members, 'member')} and ${plural(deleted.length, 'receipt')}`,
    });
    return deleted;
  });
  await cld.destroyAll(bills);
  return { ok: true };
});

// ----- activity log -----

function limitParam(req, def, max) {
  const n = Number(req.query.limit);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def;
}

route('GET', '/activity', async (req) => {
  const { rows } = await query(`SELECT ${ACTIVITY_COLUMNS} FROM activity_log ORDER BY id DESC LIMIT $1`, [
    limitParam(req, 50, 500),
  ]);
  return rows;
});

route('GET', '/trips/:id/activity', async (req) => {
  const id = idParam(req, 'Trip');
  const { rows } = await query(
    `SELECT ${ACTIVITY_COLUMNS} FROM activity_log WHERE trip_id = $1 ORDER BY id DESC LIMIT $2`,
    [id, limitParam(req, 500, 5000)]
  );
  return rows;
});

// ----- members -----

route('POST', '/trips/:id/members', async (req) => {
  const tripId = idParam(req, 'Trip');
  const b = bodyOf(req);
  const f = memberFields(b);
  const actor = actorOf(b);
  await tx(async (c) => {
    const trip = await lockTrip(c, tripId);
    const { rows } = await c.query('INSERT INTO members (trip_id, name, phone) VALUES ($1, $2, $3) RETURNING id', [
      tripId,
      f.name,
      f.phone,
    ]);
    await logActivity(c, {
      tripId,
      tripName: trip.name,
      actor,
      action: 'create',
      entity: 'member',
      entityId: rows[0].id,
      summary: `Added member ${f.name}${f.phone ? ` (${f.phone})` : ''}`,
    });
  });
  return created(await tripDetail(tripId));
});

route('PUT', '/members/:id', async (req) => {
  const id = idParam(req, 'Member');
  const b = bodyOf(req);
  const f = memberFields(b);
  const actor = actorOf(b);
  const tripId = await tx(async (c) => {
    const old = await lockRow(c, 'members', id, 'Member');
    await c.query('UPDATE members SET name = $1, phone = $2 WHERE id = $3', [f.name, f.phone, id]);
    const d = diff(old, f, [
      { key: 'name', label: 'name' },
      { key: 'phone', label: 'phone' },
    ]);
    if (d.text) {
      await logActivity(c, {
        tripId: old.trip_id,
        tripName: old.trip_name,
        actor,
        action: 'update',
        entity: 'member',
        entityId: id,
        summary: `Updated member ${old.name}: ${d.text}`,
        details: { changes: d.changes },
      });
    }
    return old.trip_id;
  });
  return await tripDetail(tripId);
});

route('DELETE', '/members/:id', async (req) => {
  const id = idParam(req, 'Member');
  const actor = actorOf(bodyOf(req));
  const tripId = await tx(async (c) => {
    const m = await lockRow(c, 'members', id, 'Member');
    const { rows } = await c.query(
      'SELECT EXISTS (SELECT 1 FROM expenses WHERE paid_by = $1) OR EXISTS (SELECT 1 FROM contributions WHERE member_id = $1) AS used',
      [id]
    );
    if (rows[0].used) throw httpError(409, `${m.name} has expenses or contributions recorded. Remove those first.`);
    await c.query('DELETE FROM members WHERE id = $1', [id]);
    await logActivity(c, {
      tripId: m.trip_id,
      tripName: m.trip_name,
      actor,
      action: 'delete',
      entity: 'member',
      entityId: id,
      summary: `Removed member ${m.name}`,
    });
    return m.trip_id;
  });
  return await tripDetail(tripId);
});

// ----- budget categories -----

route('POST', '/trips/:id/categories', async (req) => {
  const tripId = idParam(req, 'Trip');
  const b = bodyOf(req);
  const f = categoryFields(b);
  const actor = actorOf(b);
  await tx(async (c) => {
    const trip = await lockTrip(c, tripId);
    const { rows } = await c.query('INSERT INTO categories (trip_id, name, budget) VALUES ($1, $2, $3) RETURNING id', [
      tripId,
      f.name,
      f.budget,
    ]);
    await logActivity(c, {
      tripId,
      tripName: trip.name,
      actor,
      action: 'create',
      entity: 'category',
      entityId: rows[0].id,
      summary: `Added budget category ${q(f.name)} with ${fmtMoney(f.budget, trip.currency)}`,
    });
  });
  return created(await tripDetail(tripId));
});

route('PUT', '/categories/:id', async (req) => {
  const id = idParam(req, 'Category');
  const b = bodyOf(req);
  const f = categoryFields(b);
  const actor = actorOf(b);
  const tripId = await tx(async (c) => {
    const old = await lockRow(c, 'categories', id, 'Category');
    await c.query('UPDATE categories SET name = $1, budget = $2 WHERE id = $3', [f.name, f.budget, id]);
    const d = diff(old, f, [
      { key: 'name', label: 'name' },
      { key: 'budget', label: 'budget', fmt: (v) => fmtMoney(v, old.trip_currency) },
    ]);
    if (d.text) {
      await logActivity(c, {
        tripId: old.trip_id,
        tripName: old.trip_name,
        actor,
        action: 'update',
        entity: 'category',
        entityId: id,
        summary: `Updated budget category ${q(old.name)}: ${d.text}`,
        details: { changes: d.changes },
      });
    }
    return old.trip_id;
  });
  return await tripDetail(tripId);
});

route('DELETE', '/categories/:id', async (req) => {
  const id = idParam(req, 'Category');
  const actor = actorOf(bodyOf(req));
  const tripId = await tx(async (c) => {
    const old = await lockRow(c, 'categories', id, 'Category');
    const { rows } = await c.query('SELECT COUNT(*) AS n FROM expenses WHERE category_id = $1', [id]);
    // ON DELETE SET NULL: its expenses become "Uncategorized".
    await c.query('DELETE FROM categories WHERE id = $1', [id]);
    await logActivity(c, {
      tripId: old.trip_id,
      tripName: old.trip_name,
      actor,
      action: 'delete',
      entity: 'category',
      entityId: id,
      summary:
        `Deleted budget category ${q(old.name)}` +
        (rows[0].n ? ` (${plural(rows[0].n, 'expense')} moved to Uncategorized)` : ''),
    });
    return old.trip_id;
  });
  return await tripDetail(tripId);
});

// ----- contributions to the common fund -----

route('POST', '/trips/:id/contributions', async (req) => {
  const tripId = idParam(req, 'Trip');
  const b = bodyOf(req);
  const f = contributionFields(b);
  const actor = actorOf(b);
  await tx(async (c) => {
    const trip = await lockTrip(c, tripId);
    const { member_name: memberName } = await refNames(c, tripId, { member: f.member_id });
    const { rows } = await c.query(
      `INSERT INTO contributions (trip_id, member_id, amount, date, note, created_by_name, created_by_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [tripId, f.member_id, f.amount, f.date, f.note, actor.name, actor.phone]
    );
    await logActivity(c, {
      tripId,
      tripName: trip.name,
      actor,
      action: 'create',
      entity: 'contribution',
      entityId: rows[0].id,
      summary: `Recorded ${fmtMoney(f.amount, trip.currency)} from ${memberName} into the trip fund`,
    });
  });
  return created(await tripDetail(tripId));
});

route('PUT', '/contributions/:id', async (req) => {
  const id = idParam(req, 'Contribution');
  const b = bodyOf(req);
  const f = contributionFields(b);
  const actor = actorOf(b);
  const tripId = await tx(async (c) => {
    const old = await lockRow(c, 'contributions', id, 'Contribution');
    await refNames(c, old.trip_id, { member: f.member_id });
    await c.query('UPDATE contributions SET member_id = $1, amount = $2, date = $3, note = $4 WHERE id = $5', [
      f.member_id,
      f.amount,
      f.date,
      f.note,
      id,
    ]);
    const names = await nameMaps(c, old.trip_id);
    const d = diff(old, f, [
      { key: 'member_id', label: 'member', fmt: names.member },
      { key: 'amount', label: 'amount', fmt: (v) => fmtMoney(v, old.trip_currency) },
      { key: 'date', label: 'date' },
      { key: 'note', label: 'note', fmt: short },
    ]);
    if (d.text) {
      await logActivity(c, {
        tripId: old.trip_id,
        tripName: old.trip_name,
        actor,
        action: 'update',
        entity: 'contribution',
        entityId: id,
        summary: `Updated fund payment from ${names.member(old.member_id)}: ${d.text}`,
        details: { changes: d.changes },
      });
    }
    return old.trip_id;
  });
  return await tripDetail(tripId);
});

route('DELETE', '/contributions/:id', async (req) => {
  const id = idParam(req, 'Contribution');
  const actor = actorOf(bodyOf(req));
  const tripId = await tx(async (c) => {
    const old = await lockRow(c, 'contributions', id, 'Contribution');
    const names = await nameMaps(c, old.trip_id);
    await c.query('DELETE FROM contributions WHERE id = $1', [id]);
    await logActivity(c, {
      tripId: old.trip_id,
      tripName: old.trip_name,
      actor,
      action: 'delete',
      entity: 'contribution',
      entityId: id,
      summary: `Deleted fund payment of ${fmtMoney(old.amount, old.trip_currency)} from ${names.member(old.member_id)}`,
    });
    return old.trip_id;
  });
  return await tripDetail(tripId);
});

// ----- direct-to-Cloudinary upload signatures -----

route('POST', '/trips/:id/upload-signatures', async (req) => {
  const tripId = idParam(req, 'Trip');
  const b = bodyOf(req);
  actorOf(b); // uploads are only for people who identify themselves, like every other change
  const { files } = b;
  if (!Array.isArray(files) || !files.length) throw httpError(400, 'Choose at least one file');
  if (files.length > MAX_FILES) throw httpError(400, `You can upload at most ${MAX_FILES} files at a time`);
  for (const f of files) {
    if (!isPlainObject(f)) throw httpError(400, 'Invalid file description');
    const name = text(f.name, 'File name', 255) ?? 'file';
    if (!cld.fileType(f)) {
      throw httpError(400, `Unsupported file type: ${name}. Use JPG, PNG, WebP, HEIC, GIF or PDF.`);
    }
    if (f.size != null && f.size !== '') {
      const size = Number(f.size);
      if (!Number.isFinite(size) || size < 0) throw httpError(400, `Invalid file size for ${name}`);
      if (size > cld.MAX_FILE_BYTES) throw httpError(400, `${name} is larger than ${cld.MAX_FILE_MB} MB`);
    }
  }
  if (!cld.isConfigured()) throw httpError(503, 'Cloudinary is not configured on the server, so receipts cannot be uploaded.');
  const { rows } = await query('SELECT id FROM trips WHERE id = $1', [tripId]);
  if (!rows.length) throw httpError(404, 'Trip not found');
  return { uploads: files.map((f) => cld.signUpload(tripId, f)) };
});

// Uploaded to Cloudinary but never saved (form cancelled, save failed): delete the files again.
// Only genuine uploads in this trip's folder that are not attached to any expense are removed.
route('POST', '/trips/:id/uploads/discard', async (req) => {
  const tripId = idParam(req, 'Trip');
  const list = bodyOf(req).bills;
  if (!Array.isArray(list) || list.length > MAX_FILES) throw httpError(400, 'bills must be a list of up to 10 uploads');
  const genuine = list.filter((r) => cld.verifyUploadResult(r, tripId)).map((r) => cld.billRow(r));
  return { ok: true, discarded: await discardUploads(genuine) };
});

// ----- expenses (+ bills) -----

function expenseLine(f, names, currencyCode) {
  const payer = f.paid_by == null ? 'paid from the trip fund' : `paid by ${names.payer}`;
  return `${q(f.title)} ${fmtMoney(f.amount, currencyCode)} (${names.category ?? 'Uncategorized'}, ${payer})`;
}

route('POST', '/trips/:id/expenses', async (req) => {
  const tripId = idParam(req, 'Trip');
  const b = bodyOf(req);
  const f = expenseFields(b);
  const actor = actorOf(b);
  const { bills, rejected } = verifyBills(b.bills, tripId, { min: 0 });
  try {
    if (rejected) throw httpError(400, REJECTED_UPLOAD);
    await tx(async (c) => {
      const trip = await lockTrip(c, tripId);
      const r = await refNames(c, tripId, { category: f.category_id, member: f.paid_by, memberLabel: 'payer' });
      const { rows } = await c.query(
        `INSERT INTO expenses (trip_id, category_id, paid_by, title, amount, date, notes, created_by_name, created_by_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [tripId, f.category_id, f.paid_by, f.title, f.amount, f.date, f.notes, actor.name, actor.phone]
      );
      await insertBills(c, rows[0].id, bills, actor);
      await logActivity(c, {
        tripId,
        tripName: trip.name,
        actor,
        action: 'create',
        entity: 'expense',
        entityId: rows[0].id,
        summary:
          `Added expense ${expenseLine(f, { category: r.category_name, payer: r.member_name }, trip.currency)}` +
          (bills.length ? ` with ${plural(bills.length, 'receipt')}` : ' (no receipt)'),
      });
    });
  } catch (err) {
    await discardUploads(bills);
    throw err;
  }
  return created(await tripDetail(tripId));
});

route('PUT', '/expenses/:id', async (req) => {
  const id = idParam(req, 'Expense');
  const b = bodyOf(req);
  const f = expenseFields(b);
  const actor = actorOf(b);
  const tripId = await tx(async (c) => {
    const old = await lockRow(c, 'expenses', id, 'Expense');
    await refNames(c, old.trip_id, { category: f.category_id, member: f.paid_by, memberLabel: 'payer' });
    await c.query(
      `UPDATE expenses SET category_id = $1, paid_by = $2, title = $3, amount = $4, date = $5, notes = $6,
                           updated_by_name = $7, updated_by_phone = $8, updated_at = now()
       WHERE id = $9`,
      [f.category_id, f.paid_by, f.title, f.amount, f.date, f.notes, actor.name, actor.phone, id]
    );
    const names = await nameMaps(c, old.trip_id);
    const d = diff(old, f, [
      { key: 'title', label: 'description' },
      { key: 'amount', label: 'amount', fmt: (v) => fmtMoney(v, old.trip_currency) },
      { key: 'date', label: 'date' },
      { key: 'category_id', label: 'category', fmt: names.category },
      { key: 'paid_by', label: 'paid by', fmt: names.payer },
      { key: 'notes', label: 'notes', fmt: short },
    ]);
    if (d.text) {
      await logActivity(c, {
        tripId: old.trip_id,
        tripName: old.trip_name,
        actor,
        action: 'update',
        entity: 'expense',
        entityId: id,
        summary: `Updated expense ${q(old.title)}: ${d.text}`,
        details: { changes: d.changes },
      });
    }
    return old.trip_id;
  });
  return await tripDetail(tripId);
});

route('DELETE', '/expenses/:id', async (req) => {
  const id = idParam(req, 'Expense');
  const actor = actorOf(bodyOf(req));
  const { tripId, bills } = await tx(async (c) => {
    const old = await lockRow(c, 'expenses', id, 'Expense');
    const names = await nameMaps(c, old.trip_id);
    const { rows: deleted } = await c.query(
      'DELETE FROM bills WHERE expense_id = $1 RETURNING public_id, resource_type',
      [id]
    );
    await c.query('DELETE FROM expenses WHERE id = $1', [id]);
    await logActivity(c, {
      tripId: old.trip_id,
      tripName: old.trip_name,
      actor,
      action: 'delete',
      entity: 'expense',
      entityId: id,
      summary:
        `Deleted expense ${expenseLine(old, { category: names.category(old.category_id), payer: names.payer(old.paid_by) }, old.trip_currency)}` +
        (deleted.length ? ` and its ${plural(deleted.length, 'receipt')}` : ''),
    });
    return { tripId: old.trip_id, bills: deleted };
  });
  const [detail] = await Promise.all([tripDetail(tripId), cld.destroyAll(bills)]);
  return detail;
});

route('POST', '/expenses/:id/bills', async (req) => {
  const id = idParam(req, 'Expense');
  const b = bodyOf(req);
  const actor = actorOf(b);
  const { rows } = await query('SELECT trip_id FROM expenses WHERE id = $1', [id]);
  if (!rows.length) throw httpError(404, 'Expense not found');
  const tripId = rows[0].trip_id;
  const { bills, rejected } = verifyBills(b.bills, tripId, { min: 1 });
  try {
    if (rejected) throw httpError(400, REJECTED_UPLOAD);
    await tx(async (c) => {
      const old = await lockRow(c, 'expenses', id, 'Expense');
      const names = await nameMaps(c, old.trip_id);
      await insertBills(c, id, bills, actor);
      await logActivity(c, {
        tripId: old.trip_id,
        tripName: old.trip_name,
        actor,
        action: 'upload',
        entity: 'bill',
        entityId: id,
        summary: `Uploaded ${plural(bills.length, 'receipt')} to expense ${q(old.title)} (${names.category(old.category_id)})`,
        details: { files: bills.map((x) => x.original_name) },
      });
    });
  } catch (err) {
    await discardUploads(bills);
    throw err;
  }
  return created(await tripDetail(tripId));
});

route('DELETE', '/bills/:id', async (req) => {
  const id = idParam(req, 'Bill');
  const actor = actorOf(bodyOf(req));
  const { tripId, bill } = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT b.*, e.trip_id, e.title AS expense_title, t.name AS trip_name
       FROM bills b JOIN expenses e ON e.id = b.expense_id JOIN trips t ON t.id = e.trip_id
       WHERE b.id = $1 FOR UPDATE OF b`,
      [id]
    );
    if (!rows.length) throw httpError(404, 'Bill not found');
    const bill = rows[0];
    await c.query('DELETE FROM bills WHERE id = $1', [id]);
    await logActivity(c, {
      tripId: bill.trip_id,
      tripName: bill.trip_name,
      actor,
      action: 'delete',
      entity: 'bill',
      entityId: id,
      summary: `Deleted receipt ${bill.original_name ? q(bill.original_name) : ''} from expense ${q(bill.expense_title)}`.replace('  ', ' '),
    });
    return { tripId: bill.trip_id, bill };
  });
  const [detail] = await Promise.all([tripDetail(tripId), cld.destroyAll([bill])]);
  return detail;
});

// ----- CSV exports -----

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
// Text that a spreadsheet would run as a formula gets a leading apostrophe.
const textCell = (v) => cell(/^[=+\-@\t\r]/.test(String(v ?? '')) ? `'${v}` : v);

function csvResponse(tripName, suffix, rows) {
  const ascii = tripName.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'trip';
  const utf8 = encodeURIComponent(`${tripName}_${suffix}.csv`);
  return {
    raw: '\uFEFF' + rows.map((r) => r.join(',')).join('\r\n') + '\r\n',
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${ascii}_${suffix}.csv"; filename*=UTF-8''${utf8}`,
    },
  };
}

route('GET', '/trips/:id/export.csv', async (req) => {
  const d = await tripDetail(idParam(req, 'Trip'));
  const cat = new Map(d.categories.map((c) => [c.id, c.name]));
  const mem = new Map(d.members.map((m) => [m.id, m.name]));
  const rows = [
    ['Date', 'Description', 'Category', 'Paid by', `Amount (${d.trip.currency})`, 'Notes', 'Added by', 'Added by phone', 'Receipts']
      .map(cell),
  ];
  for (const e of d.expenses) {
    rows.push([
      cell(e.date),
      textCell(e.title),
      textCell(e.category_id == null ? 'Uncategorized' : cat.get(e.category_id) ?? 'Uncategorized'),
      textCell(e.paid_by == null ? 'Trip fund' : mem.get(e.paid_by) ?? ''),
      cell(e.amount.toFixed(2)),
      textCell(e.notes),
      textCell(e.created_by_name),
      textCell(e.created_by_phone),
      cell(e.bills.map((b) => b.url).join(' ')),
    ]);
  }
  return csvResponse(d.trip.name, 'expenses', rows);
});

route('GET', '/trips/:id/activity.csv', async (req) => {
  const id = idParam(req, 'Trip');
  const [{ rows: trips }, { rows: log }] = await Promise.all([
    query('SELECT name FROM trips WHERE id = $1', [id]),
    query(`SELECT ${ACTIVITY_COLUMNS} FROM activity_log WHERE trip_id = $1 ORDER BY id`, [id]),
  ]);
  if (!trips.length) throw httpError(404, 'Trip not found');
  const rows = [['When (UTC)', 'Name', 'Phone', 'Action', 'Item', 'What changed'].map(cell)];
  for (const a of log) {
    rows.push([
      cell(new Date(a.created_at).toISOString().replace('T', ' ').slice(0, 19)),
      textCell(a.actor_name),
      textCell(a.actor_phone),
      cell(a.action),
      cell(a.entity),
      textCell(a.summary),
    ]);
  }
  return csvResponse(trips[0].name, 'activity', rows);
});


// ---------- errors (Express 5 forwards rejected async handlers here) ----------

const PG_ERRORS = {
  23505: [409, 'That record already exists.'],
  23503: [409, 'This change conflicts with related records. Refresh the page and try again.'],
  23514: [400, 'A value is outside the allowed range.'],
  23502: [400, 'A required value is missing.'],
  '22P02': [400, 'A value has the wrong format.'],
  22007: [400, 'Invalid date.'],
  22008: [400, 'Date is out of range.'],
  22003: [400, 'A number is out of range.'],
  22001: [400, 'A text value is too long.'],
};
const DB_DOWN_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P03', '53300']);
const isDbDown = (err) =>
  DB_DOWN_CODES.has(err.code) || /timeout exceeded when trying to connect|Connection terminated/i.test(err.message ?? '');

/** Maps any thrown error to {status, message}; logs unexpected ones. */
function errorInfo(err, method, path) {
  let status = 500;
  let message = 'Something went wrong. Please try again.';
  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
  } else if (err?.code === '23505' && err.constraint === 'bills_public_id_key') {
    [status, message] = [409, 'That receipt is already attached to an expense.'];
  } else if (err?.code === '23503' && /members/.test(err.detail ?? err.message ?? '')) {
    [status, message] = [409, 'That member has expenses or contributions recorded. Remove those first.'];
  } else if (err?.code && PG_ERRORS[err.code]) {
    [status, message] = PG_ERRORS[err.code];
  } else if (err && isDbDown(err)) {
    [status, message] = [503, 'The database is not reachable right now. Please try again in a moment.'];
  } else if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 && err.expose) {
    [status, message] = [err.status, err.message];
  }
  if (status >= 500) {
    // Our own 5xx (e.g. "not configured") are expected states: one line is enough.
    if (err instanceof HttpError) console.warn(`${method} /api${path}: ${status} ${err.message}`);
    else console.error(`${method} /api${path} failed:`, err);
  }
  return { status, message };
}

// ---------- entry point ----------

const MAX_BODY = 1024 * 1024; // 1 MB of JSON is plenty: files never pass through here
const NO_STORE = { 'Cache-Control': 'no-store' };
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE },
  });
}

async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw httpError(413, 'Request is too large.');
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw httpError(413, 'Request is too large.');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, 'Request body is not valid JSON.');
  }
}

function match(method, path) {
  let methodMismatch = false;
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    if (r.method !== method) {
      methodMismatch = true;
      continue;
    }
    const params = {};
    r.keys.forEach((k, i) => {
      params[k] = m[i + 1];
    });
    return { r, params };
  }
  return { methodMismatch };
}

/**
 * Handles one API request. `segments` = the decoded path after /api (Next.js catch-all params).
 * Returns a standard Response (JSON, or CSV for the export routes).
 */
export async function dispatch(request, segments = []) {
  const path = '/' + segments.join('/');
  const method = request.method === 'HEAD' ? 'GET' : request.method;
  try {
    // Optional shared group PIN. Not user accounts: it only keeps strangers out of a public URL.
    const pin = (process.env.APP_PIN ?? '').trim();
    if (pin && !(method === 'GET' && path === '/config')) {
      const given = (request.headers.get('x-app-pin') ?? '').trim();
      if (!given || !crypto.timingSafeEqual(sha256(given), sha256(pin))) {
        return json(401, { error: 'PIN required', pinRequired: true });
      }
    }

    const found = match(method, path);
    if (!found.r) {
      return found.methodMismatch ? json(405, { error: 'Method not allowed' }) : json(404, { error: 'Not found' });
    }
    const req = {
      params: found.params,
      body: await readBody(request),
      query: Object.fromEntries(new URL(request.url).searchParams),
    };
    const out = await found.r.handler(req);
    if (out && typeof out.raw === 'string') {
      return new Response(request.method === 'HEAD' ? null : out.raw, {
        status: 200,
        headers: { ...out.headers, ...NO_STORE },
      });
    }
    if (out && out.status === 201 && 'body' in out) return json(201, out.body);
    return json(200, out);
  } catch (err) {
    const { status, message } = errorInfo(err, method, path);
    return json(status, { error: message });
  }
}
