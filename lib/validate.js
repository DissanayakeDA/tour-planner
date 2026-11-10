// Small, dependency-free validation helpers shared by the API routes.
// Every helper throws an HttpError(400) with a human readable message on bad input.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true; // message is safe to show to the user
  }
}

export const httpError = (status, message) => new HttpError(status, message);

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The JSON body as an object ({} when missing or not an object). */
export const bodyOf = (req) => (isPlainObject(req.body) ? req.body : {});

export const MAX_INT = 2147483647; // Postgres INT / SERIAL upper bound
export const MAX_MONEY = 999999999999.99; // NUMERIC(14,2) upper bound (just below 1e12)

/** Positive 32-bit integer id from a number or digit string, else null. */
export function toId(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 && v <= MAX_INT ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!/^[1-9]\d{0,9}$/.test(s)) return null;
    const n = Number(s);
    return n <= MAX_INT ? n : null;
  }
  return null;
}

/** Route `:id` param. Anything that is not a positive integer is simply "not found". */
export function idParam(req, label) {
  const id = toId(req.params.id);
  if (!id) throw httpError(404, `${label} not found`);
  return id;
}

/** Trimmed text or null. Rejects non-strings and over-long values. */
export function text(v, field, max, { required = false } = {}) {
  if (v == null) v = '';
  if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
  if (typeof v !== 'string') throw httpError(400, `${field} must be text`);
  const s = v.replace(/\u0000/g, '').trim(); // Postgres TEXT cannot hold NUL bytes
  if (!s) {
    if (required) throw httpError(400, `${field} is required`);
    return null;
  }
  if (s.length > max) throw httpError(400, `${field} must be at most ${max} characters`);
  return s;
}

/** Money amount rounded to 2 decimals. Empty → 0 (or 400 when required). */
export function money(v, field, { required = false, min = 0 } = {}) {
  if (typeof v === 'string') v = v.trim();
  if (v == null || v === '') {
    if (required) throw httpError(400, `${field} is required`);
    return 0;
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw httpError(400, `${field} must be a number`);
  const r = Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100 || 0; // `|| 0` turns -0 into 0
  if (r < min) throw httpError(400, min > 0 ? `${field} must be greater than 0` : `${field} cannot be negative`);
  if (r > MAX_MONEY) throw httpError(400, `${field} is too large`);
  return r;
}

const daysInMonth = (y, m) => [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** 'YYYY-MM-DD' (a real calendar date) or null when empty. */
export function dateStr(v, field) {
  if (v == null) return null;
  if (typeof v !== 'string') throw httpError(400, `${field} must be a date (YYYY-MM-DD)`);
  const s = v.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const y = m ? Number(m[1]) : 0;
  const mo = m ? Number(m[2]) : 0;
  const d = m ? Number(m[3]) : 0;
  if (!m || y < 1 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
    throw httpError(400, `${field} must be a valid date (YYYY-MM-DD)`);
  }
  return s;
}

/** ISO-4217 style 3-letter code, uppercased. Default LKR. */
export function currency(v) {
  const s = text(v, 'Currency', 10);
  if (!s) return 'LKR';
  const c = s.toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw httpError(400, 'Currency must be a 3-letter code such as LKR or USD');
  return c;
}

/** Optional reference id from the body ("" / null → null). Bad shape → 400 Invalid <label>. */
export function optionalRef(v, label) {
  if (v == null || v === '') return null;
  const id = toId(v);
  if (!id) throw httpError(400, `Invalid ${label}`);
  return id;
}

/** Whole number in [min, max]. Empty → 400 when required, else `fallback`. */
export function int(v, field, { required = false, min = 0, max = MAX_INT, fallback = 0 } = {}) {
  if (typeof v === 'string') v = v.trim();
  if (v == null || v === '') {
    if (required) throw httpError(400, `${field} is required`);
    return fallback;
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n)) throw httpError(400, `${field} must be a whole number`);
  if (n < min || n > max) throw httpError(400, `${field} must be between ${min} and ${max}`);
  return n;
}

/**
 * The person making a change: body.actor = {name, phone}. Required on every change because the app
 * has no login; it is what the activity log records. Phone is normalised to digits with an optional
 * leading "+" (spaces, dashes, dots and brackets are dropped).
 */
export function actorOf(body) {
  const a = isPlainObject(body?.actor) ? body.actor : {};
  const name = text(a.name, 'Your name', 80);
  const rawPhone = text(a.phone, 'Your phone number', 40);
  if (!name || !rawPhone) {
    throw httpError(400, 'Please enter your name and phone number. Every change is recorded with who made it.');
  }
  if (name.length < 2) throw httpError(400, 'Your name must be at least 2 characters');
  const phone = rawPhone.replace(/[\s\-().]/g, '');
  if (!/^\+?\d{9,15}$/.test(phone)) {
    throw httpError(400, 'Enter a valid phone number (9 to 15 digits, for example 0771234567 or +94771234567)');
  }
  return { name, phone };
}

/** paid_by: "fund" / "" / null mean the common trip fund (null); otherwise a member id. */
export function payerRef(v) {
  if (typeof v === 'string' && v.trim().toLowerCase() === 'fund') return null;
  return optionalRef(v, 'payer');
}
