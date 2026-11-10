// Activity log: who (name + phone) changed what, and when. The app has no login, so every
// change carries an `actor` and is written here in the same transaction as the change itself.

/** "Rs 30,000.00" for Sri Lankan rupees, otherwise "USD 30.00". */
export function fmtMoney(n, currency = 'LKR') {
  const v = Number(n) || 0;
  const label = currency === 'LKR' ? 'Rs' : currency;
  return `${label} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const show = (v) => (v == null || v === '' ? '(empty)' : String(v));

/**
 * Compares two records field by field.
 * fields: [{key, label, fmt?}] where fmt(value) renders a value for people.
 * Returns {changes: {key: {from, to}}, text: "amount LKR 1.00 → LKR 2.00; date (empty) → 2026-11-10"}.
 */
export function diff(before, after, fields) {
  const changes = {};
  const parts = [];
  for (const { key, label, fmt = show } of fields) {
    const a = before?.[key] ?? null;
    const b = after?.[key] ?? null;
    if (a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005)) continue;
    changes[key] = { from: a, to: b };
    parts.push(`${label} ${fmt(a)} → ${fmt(b)}`);
  }
  return { changes, text: parts.join('; ') };
}

/**
 * Inserts one activity row. `run` is a client (inside tx) or anything with .query(sql, params).
 * entry: {tripId, tripName, actor:{name, phone}, action, entity, entityId, summary, details}
 */
export async function logActivity(run, { tripId, tripName = null, actor, action, entity, entityId = null, summary, details = null }) {
  await run.query(
    `INSERT INTO activity_log (trip_id, trip_name, actor_name, actor_phone, action, entity, entity_id, summary, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      tripId,
      tripName ?? null,
      actor.name,
      actor.phone,
      action,
      entity,
      entityId,
      String(summary).slice(0, 1000),
      details == null ? null : JSON.stringify(details),
    ]
  );
}

export const ACTIVITY_COLUMNS =
  'id, trip_id, trip_name, actor_name, actor_phone, action, entity, entity_id, summary, details, created_at';
