'use client';
// App-wide state: server config, the remembered "who am I" (name + phone), toasts and the PIN gate.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { api, PIN_EVENT } from '@/lib/client/api';
import { store } from '@/lib/client/storage';

const ConfigCtx = createContext({ cloudinary: false, maxFileMb: 10, pinRequired: false });
const ActorCtx = createContext({ actor: { name: '', phone: '' }, rememberActor: () => {} });
const ToastCtx = createContext(() => {});

export const useConfig = () => useContext(ConfigCtx);
export const useActor = () => useContext(ActorCtx);
export const useToast = () => useContext(ToastCtx);

function Toasts({ items, dismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
          <Icon name={t.type === 'error' ? 'alert' : 'check'} />
          <div className="grow">{t.message}</div>
          <button className="btn-icon sm" style={{ color: '#fff', marginTop: -4 }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    store.set('tk.pin', pin.trim());
    try {
      await api('/trips');
      onUnlock();
    } catch (err) {
      setError(err.status === 401 ? 'That PIN is not correct.' : err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pin-screen">
      <form className="card pin-card stack" onSubmit={submit}>
        <div className="brand-mark" style={{ width: 48, height: 48, margin: '0 auto', borderRadius: 12 }}>
          <Icon name="lock" size={22} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.2rem' }}>Enter group PIN</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            This trip manager is shared by your group. Ask the organiser for the PIN.
          </p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          aria-label="Group PIN"
          autoFocus
          required
        />
        {error && <p className="small t-danger">{error}</p>}
        <button className="btn primary block" disabled={busy || !pin.trim()}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}

export default function Providers({ children }) {
  const [config, setConfig] = useState(null);
  const [locked, setLocked] = useState(false);
  const [actor, setActor] = useState({ name: '', phone: '' });
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  useEffect(() => {
    setActor(store.getJSON('tk.actor', { name: '', phone: '' }) ?? { name: '', phone: '' });
    let alive = true;
    fetch('/api/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((c) => {
        if (!alive) return;
        setConfig(c);
        if (c.pinRequired && !store.get('tk.pin')) setLocked(true);
      })
      .catch(() => alive && setConfig({ cloudinary: false, maxFileMb: 10, pinRequired: false }));
    const onPin = () => setLocked(true);
    window.addEventListener(PIN_EVENT, onPin);
    return () => {
      alive = false;
      window.removeEventListener(PIN_EVENT, onPin);
    };
  }, []);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, type = 'success') => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-3), { id, message, type }]);
      setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3000);
    },
    [dismiss]
  );

  const rememberActor = useCallback((a) => {
    const v = { name: (a.name || '').trim(), phone: (a.phone || '').trim() };
    setActor(v);
    store.setJSON('tk.actor', v);
  }, []);

  const actorValue = useMemo(() => ({ actor, rememberActor }), [actor, rememberActor]);

  if (locked) {
    return (
      <ToastCtx.Provider value={toast}>
        <PinGate onUnlock={() => window.location.reload()} />
      </ToastCtx.Provider>
    );
  }

  return (
    <ConfigCtx.Provider value={config ?? { cloudinary: false, maxFileMb: 10, pinRequired: false, loading: true }}>
      <ActorCtx.Provider value={actorValue}>
        <ToastCtx.Provider value={toast}>
          {children}
          <Toasts items={toasts} dismiss={dismiss} />
        </ToastCtx.Provider>
      </ActorCtx.Provider>
    </ConfigCtx.Provider>
  );
}
