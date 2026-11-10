'use client';
// Direct browser -> Cloudinary uploads (files never pass through our server, so Vercel's 4.5 MB
// request limit does not apply). Flow: ask our API for signed params, POST each file to Cloudinary
// with XHR (for progress), return the upload results for the API to verify and store.
import { api } from './api';

export const MAX_FILES = 10;
export const MAX_MB = 10;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf'];
const EXT_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', pdf: 'application/pdf' };

/** Normalised type, falling back to the extension (some browsers report "" for HEIC). */
export function typeOf(file) {
  const t = (file.type || '').toLowerCase();
  if (OK_TYPES.includes(t)) return t;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name || '')?.[1]?.toLowerCase();
  return EXT_TYPES[ext] || t;
}

export function checkFile(file) {
  if (!OK_TYPES.includes(typeOf(file))) return `${file.name}: only photos (JPG, PNG, WebP, HEIC, GIF) or PDF files`;
  if (file.size > MAX_MB * 1024 * 1024) return `${file.name} is larger than ${MAX_MB} MB`;
  return null;
}

/**
 * Downscales big phone photos (JPEG/PNG/WebP over 1.5 MB) to max 2000 px, JPEG 0.85.
 * Returns the original file when compression is not possible or not smaller.
 */
export async function compressImage(file) {
  const type = typeOf(file);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type) || file.size <= 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // PNG transparency -> white, like paper
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

function xhrUpload(url, fields, file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.public_id) resolve(data);
      else reject(new Error(`${file.name}: ${data?.error?.message || `upload failed (${xhr.status})`}`));
    };
    xhr.onerror = () => reject(new Error(`${file.name}: network error while uploading`));
    xhr.send(fd);
  });
}

/**
 * Uploads files for a trip. onProgress(index, fraction). Returns UploadResult[] for the API.
 * If any upload fails, the ones that succeeded are discarded again and the error is thrown.
 */
export async function uploadReceipts(tripId, files, actor, onProgress) {
  if (!files.length) return [];
  const prepared = await Promise.all(files.map(compressImage));
  const { uploads } = await api(`/trips/${tripId}/upload-signatures`, {
    method: 'POST',
    body: { actor, files: prepared.map((f) => ({ name: f.name, type: typeOf(f), size: f.size })) },
  });
  const settled = await Promise.allSettled(
    prepared.map((f, i) => xhrUpload(uploads[i].uploadUrl, uploads[i].fields, f, (p) => onProgress?.(i, p)))
  );
  const results = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? {
          public_id: s.value.public_id,
          version: s.value.version,
          signature: s.value.signature,
          resource_type: s.value.resource_type,
          format: s.value.format,
          bytes: s.value.bytes,
          secure_url: s.value.secure_url,
          original_filename: s.value.original_filename,
          original_name: files[i].name,
        }
      : null
  );
  const failed = settled.find((s) => s.status === 'rejected');
  if (failed) {
    await discardUploads(tripId, results.filter(Boolean));
    throw failed.reason;
  }
  return results;
}

/** Deletes uploads that were never saved (best effort). */
export async function discardUploads(tripId, results) {
  if (!results?.length) return;
  try {
    await api(`/trips/${tripId}/uploads/discard`, { method: 'POST', body: { bills: results } });
  } catch {
    /* best effort */
  }
}
