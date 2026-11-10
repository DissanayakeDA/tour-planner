// Formatting helpers shared by all pages (safe on server and client).

const moneyFormatters = new Map();

export function money(n, currency = 'LKR') {
  const v = Number(n) || 0;
  if (currency === 'LKR') {
    // Sri Lankan rupees read as "Rs 100,000.00" (Intl would print "LKR").
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${v < 0 ? '-' : ''}Rs ${abs}`;
  }
  let f = moneyFormatters.get(currency);
  if (f === undefined) {
    try {
      f = new Intl.NumberFormat('en-LK', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      f = null;
    }
    moneyFormatters.set(currency, f);
  }
  if (f) return f.format(v);
  return `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Compact amount for tight spots: "Rs 100K". */
export function moneyShort(n, currency = 'LKR') {
  const v = Number(n) || 0;
  const sym = currency === 'LKR' ? 'Rs' : currency;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${sym} ${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e4) return `${sym} ${Math.round(v / 1e3)}K`;
  return `${sym} ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' -> '12 Nov 2026' (no timezone shifts). */
export function fmtDate(s) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function dateRange(a, b) {
  if (a && b) return `${fmtDate(a)} – ${fmtDate(b)}`;
  return fmtDate(a || b);
}

/** ISO timestamp -> '12 Nov 2026, 14:05' in the viewer's timezone. */
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

/** '5 min ago', '3 h ago', else the date. */
export function timeAgo(iso) {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return fmtDateTime(iso);
}

/** Local (not UTC) today as YYYY-MM-DD. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function pct(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** Budget status from utilisation %. */
export function budgetStatus(spent, budget) {
  if (!(budget > 0)) return spent > 0 ? { tone: 'neutral', label: 'No budget' } : { tone: 'neutral', label: '—' };
  const p = (spent / budget) * 100;
  if (p > 100) return { tone: 'danger', label: 'Over budget' };
  if (p >= 85) return { tone: 'warning', label: 'Near limit' };
  return { tone: 'success', label: 'Within budget' };
}

export const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
