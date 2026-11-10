'use client';
// Browser-side API client. Adds the group PIN header when one is stored and turns
// error responses into thrown Errors with the server's human-readable message.
import { store } from './storage';

export const PIN_EVENT = 'tk:pin-required';

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function headers(json) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  const pin = store.get('tk.pin');
  if (pin) h['X-App-Pin'] = pin;
  return h;
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your internet connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.pinRequired) {
    store.remove('tk.pin');
    window.dispatchEvent(new Event(PIN_EVENT));
  }
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data);
  return data;
}

/** Downloads a CSV (or any file) from the API, carrying the PIN header that a plain link cannot. */
export async function download(path, fallbackName) {
  const res = await fetch('/api' + path, { headers: headers(false), cache: 'no-store' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || 'Download failed');
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="([^"]+)"/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
