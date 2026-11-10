// Cloudinary: credentials (read from env at call time), signed direct-upload parameters,
// verification of the upload results the browser sends back, and best-effort deletion.
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';

export const MAX_FILE_MB = 10;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// MIME type -> Cloudinary resource type. PDFs go up as "image" too: that gives page thumbnails
// (pg_1) and inline viewing. Free accounts block PDF delivery for image AND raw alike until
// "Allow delivery of PDF and ZIP files" is enabled (Console -> Settings -> Security).
// "raw" is still accepted for bills stored by earlier versions.
const TYPES = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  'image/gif': 'image',
  'application/pdf': 'image',
};
// Some browsers report an empty type (e.g. HEIC on Windows) or a non-standard alias.
const TYPE_ALIASES = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/x-png': 'image/png' };
const EXT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', pdf: 'application/pdf',
};
// Signed into every image upload so Cloudinary itself rejects anything else.
const IMAGE_FORMATS = 'jpg,jpeg,png,webp,heic,heif,gif,pdf';

function creds() {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret, CLOUDINARY_URL } =
    process.env;
  if (cloud && key && secret) return { cloud_name: cloud.trim(), api_key: key.trim(), api_secret: secret.trim() };
  if (CLOUDINARY_URL) {
    try {
      const u = new URL(CLOUDINARY_URL.trim()); // cloudinary://<api_key>:<api_secret>@<cloud_name>
      if (u.protocol === 'cloudinary:' && u.hostname && u.username && u.password) {
        return {
          cloud_name: decodeURIComponent(u.hostname),
          api_key: decodeURIComponent(u.username),
          api_secret: decodeURIComponent(u.password),
        };
      }
    } catch {
      /* malformed URL -> not configured */
    }
  }
  return null;
}

let appliedKey = '';

/** Current credentials, pushed into the SDK config whenever they change. null if not configured. */
function config() {
  const c = creds();
  if (!c) return null;
  const key = `${c.cloud_name}\n${c.api_key}\n${c.api_secret}`;
  if (key !== appliedKey) {
    cloudinary.config({ ...c, secure: true });
    appliedKey = key;
  }
  return c;
}

export const isConfigured = () => Boolean(creds());
export const cloudName = () => creds()?.cloud_name ?? null;

export function baseFolder() {
  const f = (process.env.CLOUDINARY_FOLDER || '').trim().replace(/^\/+|\/+$/g, '');
  return f || 'trip-manager';
}

export const tripFolder = (tripId) => `${baseFolder()}/trip-${tripId}`;

/**
 * Normalised MIME type for a client-reported file {name, type}, or null if not allowed.
 * Falls back to the file extension when the browser reports no / a generic type.
 */
export function fileType(file) {
  let type = String(file?.type ?? '').trim().toLowerCase();
  type = TYPE_ALIASES[type] ?? type;
  if (TYPES[type]) return type;
  if (type === '' || type === 'application/octet-stream') {
    const ext = /\.([a-z0-9]+)$/i.exec(String(file?.name ?? ''))?.[1]?.toLowerCase();
    return EXT_TYPES[ext] ?? null;
  }
  return null;
}

function slug(name) {
  const base = String(name ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w-]+/g, '_')
    .slice(0, 60);
  return base || 'bill';
}

/**
 * Signed parameters for one direct browser -> Cloudinary upload.
 * `file` = {name, type, size} as reported by the browser (already validated by the route).
 * Returns {uploadUrl, fields}: the browser POSTs multipart FormData(fields + file) to uploadUrl.
 */
export function signUpload(tripId, file) {
  const c = config();
  if (!c) throw Object.assign(new Error('Cloudinary is not configured'), { status: 503, expose: true });
  const resourceType = TYPES[fileType(file)] ?? 'image';
  const unique = Date.now().toString(36) + crypto.randomInt(36 ** 4).toString(36).padStart(4, '0');
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    folder: tripFolder(tripId),
    public_id: `${slug(file?.name)}_${unique}`,
    overwrite: 'false',
  };
  if (resourceType === 'image') params.allowed_formats = IMAGE_FORMATS;
  // api_sign_request: drops null/undefined/"" values, sorts keys, joins "k=v" with "&",
  // appends the secret and hashes (sha1 by default). file/api_key/resource_type are not signed.
  const signature = cloudinary.utils.api_sign_request(params, c.api_secret);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloud_name)}/${resourceType}/upload`,
    fields: { ...params, signature, api_key: c.api_key },
  };
}

function safeEqualHex(a, b) {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * True if `result` is a genuine Cloudinary upload response for an asset in THIS trip's folder.
 * Cloudinary signs its upload response as hex(sha1("public_id=<id>&version=<version>" + api_secret))
 * (sha256 if the account is set to SHA-256 signatures; told apart by length). This is the same formula as
 * cloudinary.utils.verify_api_response_signature, but compared in constant time. The response signature
 * covers no timestamp, so it never expires; replays are limited by the folder check below and by the
 * UNIQUE constraint on bills.public_id.
 */
export function verifyUploadResult(result, tripId) {
  const c = config();
  if (!c || !result || typeof result !== 'object') return false;
  const { public_id: publicId, version, signature, resource_type: resourceType, secure_url: url } = result;

  if (typeof publicId !== 'string' || publicId.length > 255) return false;
  if (!(typeof version === 'number' ? Number.isSafeInteger(version) && version > 0 : /^\d{1,15}$/.test(String(version)))) {
    return false;
  }
  if (typeof signature !== 'string' || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(signature)) return false;
  if (resourceType !== 'image' && resourceType !== 'raw') return false;

  // (b) the asset must live directly in this trip's folder
  const prefix = `${tripFolder(tripId)}/`;
  if (!publicId.startsWith(prefix) || publicId.length === prefix.length || publicId.slice(prefix.length).includes('/')) {
    return false;
  }

  // (d) delivery URL must be this cloud's URL for exactly this public_id + version
  if (typeof url !== 'string') return false;
  const urlPrefix = `https://res.cloudinary.com/${c.cloud_name}/${resourceType}/upload/v${version}/`;
  if (!url.startsWith(urlPrefix)) return false;
  let path;
  try {
    path = decodeURIComponent(url.slice(urlPrefix.length));
  } catch {
    return false;
  }
  const format = typeof result.format === 'string' ? result.format : '';
  if (path !== publicId && !(resourceType === 'image' && format && path === `${publicId}.${format}`)) return false;

  // (a) signature
  const algo = signature.length === 64 ? 'sha256' : 'sha1';
  const expected = crypto
    .createHash(algo)
    .update(`public_id=${publicId}&version=${version}${c.api_secret}`)
    .digest('hex');
  return safeEqualHex(signature, expected);
}

/** DB row values for a VERIFIED upload result. */
export function billRow(result) {
  const rawExt = /\.([a-z0-9]{1,10})$/i.exec(result.public_id)?.[1]?.toLowerCase() ?? null;
  const format =
    typeof result.format === 'string' && /^[a-z0-9]{1,10}$/i.test(result.format)
      ? result.format.toLowerCase()
      : result.resource_type === 'raw'
        ? rawExt
        : null;
  const pick = (v) => (typeof v === 'string' && v.trim() ? v.replace(/\u0000/g, '').trim().slice(0, 255) : null);
  let originalName = pick(result.original_name);
  if (!originalName && pick(result.original_filename)) {
    originalName = pick(result.original_filename + (format && result.resource_type === 'image' ? `.${format}` : ''));
  }
  const bytes = Number.isSafeInteger(result.bytes) && result.bytes >= 0 && result.bytes <= 2147483647 ? result.bytes : null;
  return {
    url: result.secure_url,
    version: Number(result.version),
    public_id: result.public_id,
    resource_type: result.resource_type,
    format,
    original_name: originalName,
    bytes,
  };
}

/**
 * Display URLs for a stored bill row, built on the server (never trusted from the browser).
 * - thumb_url: 300x300 JPEG-ish thumbnail (f_auto picks AVIF/WebP/JPEG); page 1 for PDFs; null for raw files.
 * - view_url: full-size image as .jpg so HEIC photos display in every browser; PDFs open as the PDF itself.
 */
export function billUrls(b) {
  const cloud = cloudName();
  const isPdf = b.format === 'pdf' || b.resource_type === 'raw';
  if (!cloud || b.resource_type !== 'image') return { is_pdf: isPdf, thumb_url: null, view_url: b.url };
  const base = `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload`;
  const ver = b.version ? `/v${b.version}` : '';
  const id = b.public_id.split('/').map(encodeURIComponent).join('/');
  return {
    is_pdf: isPdf,
    thumb_url: `${base}/c_fill,w_300,h_300${isPdf ? ',pg_1' : ''}/f_auto/q_auto${ver}/${id}.jpg`,
    view_url: isPdf ? b.url : `${base}/f_auto/q_auto${ver}/${id}.jpg`,
  };
}

/**
 * Best-effort delete of bill assets ({public_id, resource_type}[]). Never throws.
 * Returns the Promise.allSettled results (useful for tests/logging).
 */
export async function destroyAll(bills) {
  if (!bills?.length || !config()) return [];
  const results = await Promise.allSettled(
    bills.map((b) => cloudinary.uploader.destroy(b.public_id, { resource_type: b.resource_type, invalidate: true }))
  );
  results.forEach((r, i) => {
    const ok = r.status === 'fulfilled' && (r.value?.result === 'ok' || r.value?.result === 'not found');
    if (!ok) {
      const why = r.status === 'rejected' ? r.reason?.message || r.reason?.error?.message || String(r.reason) : r.value?.result;
      console.warn(`Cloudinary destroy failed for ${bills[i].public_id}: ${why}`);
    }
  });
  return results;
}
