'use client';
// Drawer (bottom sheet on phones, right panel on desktop), confirm modal and receipt lightbox.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import ActorFields, { actorError } from './ActorFields';
import { useActor } from './Providers';

function useOverlay(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = [...f].filter((el) => !el.disabled && el.offsetParent !== null);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const auto = ref.current?.querySelector('[data-autofocus]') ?? ref.current?.querySelector('input, select, textarea, button');
      auto?.focus({ preventScroll: true });
    }, 40);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

function Portal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

/** <Drawer title onClose footer>{body}</Drawer>; wrap body+footer in a <form> via `as="form"` + onSubmit. */
export function Drawer({ title, sub, onClose, children, footer, onSubmit, busy = false }) {
  const ref = useOverlay(busy ? null : onClose);
  const Tag = onSubmit ? 'form' : 'div';
  return (
    <Portal>
      <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
        <Tag
          className="drawer"
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : undefined}
          onSubmit={onSubmit}
          noValidate={onSubmit ? true : undefined}
        >
          <div className="drawer-grip" />
          <div className="drawer-head">
            <div className="grow">
              <h2>{title}</h2>
              {sub && <div className="sub">{sub}</div>}
            </div>
            <button type="button" className="btn-icon" onClick={onClose} disabled={busy} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
          <div className="drawer-body">{children}</div>
          {footer && <div className="drawer-foot">{footer}</div>}
        </Tag>
      </div>
    </Portal>
  );
}

/**
 * Confirm dialog for destructive actions. Always asks for the actor (name + phone) because the
 * delete is recorded in the activity log. `typeToConfirm` adds a "type the name" check.
 * onConfirm(actor) may throw; its message is shown inline.
 */
export function ConfirmDialog({ title, children, confirmLabel = 'Delete', tone = 'danger', typeToConfirm, members, onConfirm, onClose }) {
  const { actor: remembered, rememberActor } = useActor();
  const [actor, setActor] = useState(remembered);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const ref = useOverlay(busy ? null : onClose);

  async function submit(e) {
    e.preventDefault();
    setShowErrors(true);
    if (actorError(actor)) return;
    if (typeToConfirm && typed.trim() !== typeToConfirm) {
      setError('The name you typed does not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(actor);
      rememberActor(actor);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
        <form className="modal" ref={ref} role="alertdialog" aria-modal="true" aria-label={title} onSubmit={submit} noValidate>
          <div className="modal-body stack">
            <div>
              <div className={`modal-icon tone-${tone}`}>
                <Icon name={tone === 'danger' ? 'trash' : 'alert'} />
              </div>
              <h2>{title}</h2>
              <div className="muted small">{children}</div>
            </div>
            {typeToConfirm && (
              <div className="field">
                <label htmlFor="confirm-type">
                  Type <b>{typeToConfirm}</b> to confirm
                </label>
                <input id="confirm-type" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus />
              </div>
            )}
            <ActorFields value={actor} onChange={setActor} members={members} showErrors={showErrors} compact />
            {error && <p className="small t-danger">{error}</p>}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={`btn ${tone === 'danger' ? 'danger solid' : 'primary'}`} disabled={busy}>
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}

/** Full-screen receipt viewer. bill = row from the API (view_url, is_pdf, original_name). */
export function Lightbox({ bill, caption, onClose }) {
  const ref = useOverlay(onClose);
  const [pdfBlocked, setPdfBlocked] = useState(false);
  useEffect(() => {
    if (!bill.is_pdf) return;
    let alive = true;
    fetch(bill.view_url, { method: 'HEAD' })
      .then((r) => alive && setPdfBlocked(r.status === 401))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bill]);
  return (
    <Portal>
      <div className="lightbox" ref={ref} role="dialog" aria-modal="true" aria-label="Receipt">
        <div className="lightbox-bar">
          <div className="grow truncate">
            <strong>{bill.original_name || 'Receipt'}</strong>
            {caption && <span style={{ opacity: 0.75 }}> · {caption}</span>}
          </div>
          <a className="btn-icon" href={bill.is_pdf ? bill.view_url : bill.url} target="_blank" rel="noopener noreferrer" aria-label="Open original in new tab">
            <Icon name="external" />
          </a>
          <button className="btn-icon" onClick={onClose} aria-label="Close" data-autofocus>
            <Icon name="x" />
          </button>
        </div>
        <div className="lightbox-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          {bill.is_pdf ? (
            pdfBlocked ? (
              <div className="card card-body stack" style={{ maxWidth: 440 }}>
                {bill.thumb_url && <img src={bill.thumb_url.replace('c_fill,w_300,h_300', 'c_limit,w_900')} alt="PDF first page" />}
                <p className="small">
                  Cloudinary is blocking PDF delivery on this account, so only the first page preview is shown. To open the
                  full PDF, turn on <b>Settings → Security → “Allow delivery of PDF and ZIP files”</b> in the Cloudinary console.
                </p>
              </div>
            ) : (
              <iframe src={bill.view_url} title={bill.original_name || 'PDF receipt'} />
            )
          ) : (
            <img src={bill.view_url} alt={bill.original_name || 'Receipt'} />
          )}
        </div>
      </div>
    </Portal>
  );
}
