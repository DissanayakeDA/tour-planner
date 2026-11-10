'use client';
// Drawer forms for a trip. Every form carries the ActorFields (name + phone, required) and
// replaces the trip detail with the server's response on success.
import { useMemo, useState } from 'react';
import Icon from './Icon';
import { Drawer } from './Overlay';
import ActorFields, { actorError } from './ActorFields';
import ReceiptPicker from './ReceiptPicker';
import { useActor, useConfig, useToast } from './Providers';
import { useTrip } from './TripContext';
import { Badge, Field } from './ui';
import { api } from '@/lib/client/api';
import { uploadReceipts, discardUploads } from '@/lib/client/upload';
import { fmtDateTime, money, today, fileSize, fmtDate } from '@/lib/client/format';

/** Shared state for a drawer form: actor (prefilled), busy flag, "show errors" after first submit. */
function useForm() {
  const { actor: remembered, rememberActor } = useActor();
  const toast = useToast();
  const [actor, setActor] = useState(remembered);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');

  /** Runs fn() when `fieldError` is null and the actor is valid. */
  async function run(fieldError, fn, successMsg) {
    setShowErrors(true);
    setError('');
    const problem = fieldError || actorError(actor);
    if (problem) {
      setError(problem);
      return false;
    }
    setBusy(true);
    try {
      await fn(actor);
      rememberActor(actor);
      if (successMsg) toast(successMsg);
      return true;
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { actor, setActor, busy, setBusy, showErrors, error, setError, run, toast };
}

function FormError({ error }) {
  if (!error) return null;
  return (
    <div className="alert danger" style={{ marginTop: 14 }}>
      <Icon name="alert" />
      <div className="grow">{error}</div>
    </div>
  );
}

const amountOk = (v, { min = 0 } = {}) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= min;

function CurrencyInput({ id, value, onChange, currency, invalid, autoFocus }) {
  return (
    <div className="input-prefix">
      <span>{currency === 'LKR' ? 'Rs' : currency}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid ? 'true' : undefined}
        placeholder="0.00"
        data-autofocus={autoFocus ? '' : undefined}
      />
    </div>
  );
}

function ExpenseFields({ f, set, detail, showErrors, requireCategory }) {
  const cur = detail.trip.currency;
  return (
    <div className="form-grid two">
      <Field label="Bill category" required={requireCategory} htmlFor="x-cat" className="full" error={showErrors && requireCategory && !f.category_id ? 'Choose a category' : null}>
        <select id="x-cat" value={f.category_id} onChange={(e) => set({ category_id: e.target.value })} aria-invalid={showErrors && requireCategory && !f.category_id ? 'true' : undefined}>
          <option value="">{requireCategory ? 'Choose a category…' : 'Uncategorized'}</option>
          {detail.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description" required htmlFor="x-title" className="full" error={showErrors && !f.title.trim() ? 'Enter a description' : null}>
        <input id="x-title" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Hotel – 2 nights" maxLength={200} aria-invalid={showErrors && !f.title.trim() ? 'true' : undefined} />
      </Field>
      <Field label="Amount" required htmlFor="x-amt" error={showErrors && !amountOk(f.amount) ? 'Enter the amount' : null}>
        <CurrencyInput id="x-amt" value={f.amount} onChange={(v) => set({ amount: v })} currency={cur} invalid={showErrors && !amountOk(f.amount)} />
      </Field>
      <Field label="Date" htmlFor="x-date">
        <input id="x-date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
      </Field>
      <Field label="Paid by" htmlFor="x-paid" className="full" hint="Trip fund = paid from the money collected from everyone.">
        <select id="x-paid" value={f.paid_by} onChange={(e) => set({ paid_by: e.target.value })}>
          <option value="fund">Trip fund (kitty)</option>
          {detail.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} (paid personally)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes" htmlFor="x-notes" className="full">
        <textarea id="x-notes" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" maxLength={2000} />
      </Field>
    </div>
  );
}

function expenseError(f, requireCategory) {
  if (requireCategory && !f.category_id) return 'Choose a bill category';
  if (!f.title.trim()) return 'Enter a description';
  if (!amountOk(f.amount)) return 'Enter a valid amount';
  return null;
}

const toBody = (f) => ({
  title: f.title,
  amount: f.amount,
  date: f.date,
  category_id: f.category_id || null,
  paid_by: f.paid_by,
  notes: f.notes,
});

// ---------- new expense / upload bill ----------

export function ExpenseNewDrawer({ onClose, categoryId = '', withReceipt = false }) {
  const { detail, setDetail, tripId } = useTrip();
  const config = useConfig();
  const form = useForm();
  const [f, setF] = useState({ title: '', amount: '', date: today(), category_id: categoryId ? String(categoryId) : '', paid_by: 'fund', notes: '' });
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null);
  const [phase, setPhase] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  async function submit(e) {
    e.preventDefault();
    const missingReceipt = withReceipt && config.cloudinary && !files.length ? 'Attach the bill photo or PDF' : null;
    const ok = await form.run(expenseError(f, true) || missingReceipt, async (actor) => {
      let bills = [];
      if (files.length) {
        setPhase('Uploading receipts…');
        setProgress(files.map(() => 0));
        bills = await uploadReceipts(tripId, files, actor, (i, p) =>
          setProgress((arr) => arr && arr.map((v, j) => (j === i ? p : v)))
        );
      }
      setPhase('Saving…');
      try {
        setDetail(await api(`/trips/${tripId}/expenses`, { method: 'POST', body: { ...toBody(f), bills, actor } }));
      } catch (err) {
        if (err.status === 0) await discardUploads(tripId, bills); // the server cleans up its own failures
        throw err;
      }
    }, files.length ? `Expense saved with ${files.length} receipt${files.length > 1 ? 's' : ''}` : 'Expense saved');
    setPhase('');
    if (ok) onClose();
    else setProgress(null);
  }

  return (
    <Drawer
      title={withReceipt ? 'Upload bill' : 'New expense'}
      sub={detail.trip.name}
      onClose={onClose}
      onSubmit={submit}
      busy={form.busy}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={form.busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={form.busy}>
            {form.busy ? phase || 'Saving…' : 'Save expense'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ExpenseFields f={f} set={set} detail={detail} showErrors={form.showErrors} requireCategory />
        <Field label={`Bill photo / PDF${withReceipt ? '' : ' (receipt)'}`} required={withReceipt && config.cloudinary}>
          <ReceiptPicker files={files} onChange={setFiles} progress={progress} disabled={form.busy} onError={(m) => form.toast(m, 'error')} />
        </Field>
        <ActorFields value={form.actor} onChange={form.setActor} members={detail.members} showErrors={form.showErrors} />
        <FormError error={form.error} />
      </div>
    </Drawer>
  );
}

// ---------- existing expense: edit, receipts, delete ----------

export function ReceiptTile({ bill, caption, onView, onDelete, showBy = true }) {
  return (
    <div className="receipt">
      <button type="button" className="thumb" onClick={onView} aria-label={`View ${bill.original_name || 'receipt'}`}>
        {bill.thumb_url ? <img src={bill.thumb_url} alt="" loading="lazy" /> : <Icon name="file" size={28} />}
        {bill.is_pdf && <span className="pdf-tag">PDF</span>}
        {onDelete && (
          <span
            role="button"
            tabIndex={0}
            className="del"
            aria-label="Delete receipt"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                onDelete();
              }
            }}
          >
            <Icon name="trash" size={14} />
          </span>
        )}
      </button>
      {caption}
      {showBy && (
        <div className="by" title={`Uploaded by ${bill.uploaded_by_name || 'unknown'} ${bill.uploaded_by_phone || ''}`}>
          <Icon name="user" size={12} />
          <span style={{ minWidth: 0 }}>
            <span className="truncate" style={{ display: 'block', color: 'var(--text-2)', fontWeight: 600 }}>
              {bill.uploaded_by_name || 'Unknown uploader'}
            </span>
            {bill.uploaded_by_phone && (
              <a href={`tel:${bill.uploaded_by_phone}`} style={{ color: 'inherit' }} onClick={(e) => e.stopPropagation()}>
                {bill.uploaded_by_phone}
              </a>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export function ExpenseDrawer({ id, onClose }) {
  const { detail, setDetail, tripId, askConfirm, viewBill } = useTrip();
  const config = useConfig();
  const expense = detail.expenses.find((e) => e.id === id);
  const form = useForm();
  const [f, setF] = useState(() =>
    expense
      ? {
          title: expense.title,
          amount: String(expense.amount),
          date: expense.date || '',
          category_id: expense.category_id ? String(expense.category_id) : '',
          paid_by: expense.paid_by == null ? 'fund' : String(expense.paid_by),
          notes: expense.notes || '',
        }
      : null
  );
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null);
  const [uploading, setUploading] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const cur = detail.trip.currency;

  if (!expense || !f) {
    return (
      <Drawer title="Expense" onClose={onClose}>
        <p className="muted">This expense no longer exists.</p>
      </Drawer>
    );
  }

  async function save(e) {
    e.preventDefault();
    const ok = await form.run(expenseError(f, false), async (actor) => {
      setDetail(await api(`/expenses/${id}`, { method: 'PUT', body: { ...toBody(f), actor } }));
    }, 'Expense updated');
    if (ok) onClose();
  }

  async function attach() {
    if (!files.length) return form.toast('Choose the receipt files first', 'error');
    setUploading(true);
    await form.run(null, async (actor) => {
      setProgress(files.map(() => 0));
      const bills = await uploadReceipts(tripId, files, actor, (i, p) => setProgress((arr) => arr && arr.map((v, j) => (j === i ? p : v))));
      try {
        setDetail(await api(`/expenses/${id}/bills`, { method: 'POST', body: { bills, actor } }));
      } catch (err) {
        if (err.status === 0) await discardUploads(tripId, bills);
        throw err;
      }
      setFiles([]);
    }, 'Receipts uploaded');
    setProgress(null);
    setUploading(false);
  }

  const del = () =>
    askConfirm({
      title: 'Delete this expense?',
      children: (
        <>
          “{expense.title}” ({money(expense.amount, cur)}) and its {expense.bills.length} receipt file(s) will be permanently deleted.
        </>
      ),
      onConfirm: async (actor) => {
        setDetail(await api(`/expenses/${id}`, { method: 'DELETE', body: { actor } }));
        form.toast('Expense deleted');
        onClose();
      },
    });

  const delBill = (b) =>
    askConfirm({
      title: 'Delete this receipt?',
      children: <>“{b.original_name || 'Receipt'}” will be removed from this expense and deleted from storage.</>,
      onConfirm: async (actor) => {
        setDetail(await api(`/bills/${b.id}`, { method: 'DELETE', body: { actor } }));
        form.toast('Receipt deleted');
      },
    });

  const busy = form.busy || uploading;

  return (
    <Drawer
      title={expense.title}
      sub={`${money(expense.amount, cur)} · ${fmtDate(expense.date) || 'No date'}`}
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn danger" onClick={del} disabled={busy}>
            <Icon name="trash" /> Delete
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {form.busy && !uploading ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="card card-body" style={{ background: 'var(--surface-2)' }}>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Added by</dt>
            <dd>
              {expense.created_by_name || '—'}
              {expense.created_by_phone && <div className="xs muted">{expense.created_by_phone}</div>}
            </dd>
            <dt>Added on</dt>
            <dd className="small">{fmtDateTime(expense.created_at)}</dd>
            {expense.updated_by_name && (
              <>
                <dt>Last edited by</dt>
                <dd>
                  {expense.updated_by_name}
                  <div className="xs muted">
                    {expense.updated_by_phone} · {fmtDateTime(expense.updated_at)}
                  </div>
                </dd>
              </>
            )}
          </dl>
        </div>

        <ExpenseFields f={f} set={set} detail={detail} showErrors={form.showErrors} requireCategory={false} />

        <div className="stack-sm">
          <div className="row between">
            <span className="label" style={{ margin: 0 }}>
              Receipts ({expense.bills.length})
            </span>
            {expense.bills.length === 0 && <Badge tone="warning">Missing receipt</Badge>}
          </div>
          {expense.bills.length > 0 && (
            <div className="receipts">
              {expense.bills.map((b) => (
                <ReceiptTile
                  key={b.id}
                  bill={b}
                  onView={() => viewBill(b, expense.title)}
                  onDelete={() => delBill(b)}
                  caption={
                    <div className="meta">
                      <span className="truncate t">{b.original_name || 'Receipt'}</span>
                      <span className="muted">
                        {fileSize(b.bytes)} · {fmtDateTime(b.created_at)}
                      </span>
                    </div>
                  }
                />
              ))}
            </div>
          )}
          <ReceiptPicker files={files} onChange={setFiles} progress={progress} disabled={busy} onError={(m) => form.toast(m, 'error')} />
          {files.length > 0 && (
            <button type="button" className="btn primary" onClick={attach} disabled={busy || !config.cloudinary}>
              <Icon name="upload" /> {uploading ? 'Uploading…' : `Upload ${files.length} receipt${files.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        <ActorFields value={form.actor} onChange={form.setActor} members={detail.members} showErrors={form.showErrors} />
        <FormError error={form.error} />
      </div>
    </Drawer>
  );
}

// ---------- member ----------

export function MemberDrawer({ id, onClose }) {
  const { detail, setDetail, tripId, askConfirm } = useTrip();
  const m = id ? detail.members.find((x) => x.id === id) : null;
  const form = useForm();
  const [f, setF] = useState({ name: m?.name ?? '', phone: m?.phone ?? '' });
  const [addAnother, setAddAnother] = useState(!m);
  const { summary } = detail;

  async function submit(e) {
    e.preventDefault();
    const ok = await form.run(!f.name.trim() ? 'Enter the member name' : null, async (actor) => {
      const body = { ...f, actor };
      setDetail(m ? await api(`/members/${m.id}`, { method: 'PUT', body }) : await api(`/trips/${tripId}/members`, { method: 'POST', body }));
    }, m ? 'Member updated' : `${f.name.trim()} added`);
    if (!ok) return;
    if (!m && addAnother) setF({ name: '', phone: '' });
    else onClose();
  }

  const remove = () =>
    askConfirm({
      title: `Remove ${m.name}?`,
      children: <>Members with expenses or fund payments recorded cannot be removed.</>,
      confirmLabel: 'Remove',
      onConfirm: async (actor) => {
        setDetail(await api(`/members/${m.id}`, { method: 'DELETE', body: { actor } }));
        form.toast('Member removed');
        onClose();
      },
    });

  return (
    <Drawer
      title={m ? 'Edit member' : 'Add team member'}
      sub={!m ? `${summary.membersRegistered} of ${summary.teamSize} members added` : undefined}
      onClose={onClose}
      onSubmit={submit}
      busy={form.busy}
      footer={
        <>
          {m && (
            <button type="button" className="btn danger" onClick={remove} disabled={form.busy}>
              <Icon name="trash" /> Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={form.busy}>
            {m ? 'Cancel' : 'Done'}
          </button>
          <button type="submit" className="btn primary" disabled={form.busy}>
            {form.busy ? 'Saving…' : m ? 'Save' : 'Add member'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid two">
          <Field label="Member name" required htmlFor="m-name" error={form.showErrors && !f.name.trim() ? 'Enter the name' : null}>
            <input id="m-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} data-autofocus autoComplete="off" />
          </Field>
          <Field label="Member phone" htmlFor="m-phone">
            <input id="m-phone" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={40} autoComplete="off" placeholder="07X XXX XXXX" />
          </Field>
        </div>
        {!m && (
          <label className="check">
            <input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} /> Keep this open to add the next member
          </label>
        )}
        <ActorFields value={form.actor} onChange={form.setActor} members={detail.members} showErrors={form.showErrors} />
        <FormError error={form.error} />
      </div>
    </Drawer>
  );
}

// ---------- budget category ----------

export function CategoryDrawer({ id, onClose }) {
  const { detail, setDetail, tripId, askConfirm } = useTrip();
  const c = id ? detail.categories.find((x) => x.id === id) : null;
  const form = useForm();
  const [f, setF] = useState({ name: c?.name ?? '', budget: c?.budget ? String(c.budget) : '' });
  const cur = detail.trip.currency;
  const others = detail.categories.filter((x) => x.id !== c?.id).reduce((s, x) => s + x.budget, 0);
  const unallocated = detail.trip.budget - others;

  async function submit(e) {
    e.preventDefault();
    const err = !f.name.trim() ? 'Enter the category name' : f.budget !== '' && !amountOk(f.budget) ? 'Enter a valid budget' : null;
    const ok = await form.run(err, async (actor) => {
      const body = { ...f, actor };
      setDetail(c ? await api(`/categories/${c.id}`, { method: 'PUT', body }) : await api(`/trips/${tripId}/categories`, { method: 'POST', body }));
    }, c ? 'Category updated' : 'Category added');
    if (ok) onClose();
  }

  const remove = () =>
    askConfirm({
      title: `Delete “${c.name}”?`,
      children: <>Expenses in this category will become “Uncategorized”. Nothing else is deleted.</>,
      onConfirm: async (actor) => {
        setDetail(await api(`/categories/${c.id}`, { method: 'DELETE', body: { actor } }));
        form.toast('Category deleted');
        onClose();
      },
    });

  return (
    <Drawer
      title={c ? 'Edit budget category' : 'Add budget category'}
      onClose={onClose}
      onSubmit={submit}
      busy={form.busy}
      footer={
        <>
          {c && (
            <button type="button" className="btn danger" onClick={remove} disabled={form.busy}>
              <Icon name="trash" /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={form.busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={form.busy}>
            {form.busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid two">
          <Field label="Category name" required htmlFor="c-name" error={form.showErrors && !f.name.trim() ? 'Enter a name' : null}>
            <input id="c-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} data-autofocus />
          </Field>
          <Field label="Budget for this category" htmlFor="c-budget" hint={`Unallocated from the total budget: ${money(unallocated, cur)}`}>
            <CurrencyInput id="c-budget" value={f.budget} onChange={(v) => setF({ ...f, budget: v })} currency={cur} />
          </Field>
        </div>
        <ActorFields value={form.actor} onChange={form.setActor} members={detail.members} showErrors={form.showErrors} />
        <FormError error={form.error} />
      </div>
    </Drawer>
  );
}

// ---------- fund contribution ----------

export function ContributionDrawer({ id, memberId, onClose }) {
  const { detail, setDetail, tripId, askConfirm } = useTrip();
  const c = id ? detail.contributions.find((x) => x.id === id) : null;
  const form = useForm();
  const cur = detail.trip.currency;
  const suggested = detail.summary.perPersonBudget;
  const [f, setF] = useState({
    member_id: c ? String(c.member_id) : memberId ? String(memberId) : detail.members[0] ? String(detail.members[0].id) : '',
    amount: c ? String(c.amount) : '',
    date: c?.date ?? today(),
    note: c?.note ?? '',
  });
  const memberName = useMemo(() => Object.fromEntries(detail.members.map((m) => [m.id, m.name])), [detail.members]);

  async function submit(e) {
    e.preventDefault();
    const err = !f.member_id ? 'Choose the member who paid' : !amountOk(f.amount, { min: 0.01 }) ? 'Enter the amount' : null;
    const ok = await form.run(err, async (actor) => {
      const body = { ...f, actor };
      setDetail(c ? await api(`/contributions/${c.id}`, { method: 'PUT', body }) : await api(`/trips/${tripId}/contributions`, { method: 'POST', body }));
    }, c ? 'Payment updated' : 'Payment recorded');
    if (ok) onClose();
  }

  const remove = () =>
    askConfirm({
      title: 'Delete this fund payment?',
      children: (
        <>
          {money(c.amount, cur)} from {memberName[c.member_id]} will be removed from the trip fund.
        </>
      ),
      onConfirm: async (actor) => {
        setDetail(await api(`/contributions/${c.id}`, { method: 'DELETE', body: { actor } }));
        form.toast('Payment deleted');
        onClose();
      },
    });

  return (
    <Drawer
      title={c ? 'Edit fund payment' : 'Record fund payment'}
      sub="Money a member handed over to the common trip fund"
      onClose={onClose}
      onSubmit={submit}
      busy={form.busy}
      footer={
        <>
          {c && (
            <button type="button" className="btn danger" onClick={remove} disabled={form.busy}>
              <Icon name="trash" /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={form.busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={form.busy}>
            {form.busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid two">
          <Field label="Member" required htmlFor="f-mem" className="full">
            <select id="f-mem" value={f.member_id} onChange={(e) => setF({ ...f, member_id: e.target.value })} data-autofocus>
              {detail.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Amount"
            required
            htmlFor="f-amt"
            error={form.showErrors && !amountOk(f.amount, { min: 0.01 }) ? 'Enter the amount' : null}
            hint={suggested > 0 ? `Budget per person: ${money(suggested, cur)}` : undefined}
          >
            <CurrencyInput id="f-amt" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} currency={cur} invalid={form.showErrors && !amountOk(f.amount, { min: 0.01 })} />
          </Field>
          <Field label="Date" htmlFor="f-date">
            <input id="f-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Note" htmlFor="f-note" className="full">
            <input id="f-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Cash, bank transfer…" maxLength={2000} />
          </Field>
        </div>
        {suggested > 0 && !c && (
          <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setF({ ...f, amount: String(suggested) })}>
            Use per-person budget ({money(suggested, cur)})
          </button>
        )}
        <ActorFields value={form.actor} onChange={form.setActor} members={detail.members} showErrors={form.showErrors} />
        <FormError error={form.error} />
      </div>
    </Drawer>
  );
}
