'use client';
// Trip setup / settings form: trip name, total budget and team member count are required.
import { useState } from 'react';
import Icon from './Icon';
import ActorFields, { actorError } from './ActorFields';
import { useActor, useToast } from './Providers';
import { Field } from './ui';
import { money } from '@/lib/client/format';

const blank = { name: '', budget: '', team_size: '', currency: 'LKR', destination: '', start_date: '', end_date: '', notes: '' };

export function tripFormError(f) {
  if (!f.name.trim()) return 'Enter the trip name';
  if (!(Number(f.budget) > 0)) return 'Enter the total budget';
  const n = Number(f.team_size);
  if (!Number.isInteger(n) || n < 1 || n > 1000) return 'Enter the team member count (1 to 1000)';
  if (f.currency && !/^[A-Za-z]{3}$/.test(f.currency.trim())) return 'Currency must be a 3-letter code such as LKR';
  if (f.start_date && f.end_date && f.end_date < f.start_date) return 'End date cannot be before the start date';
  return null;
}

/** onSave(body) must return a promise; body includes actor. */
export default function TripForm({ trip, onSave, submitLabel = 'Save', members = [], extraActions }) {
  const { actor: remembered, rememberActor } = useActor();
  const toast = useToast();
  const [f, setF] = useState(() =>
    trip
      ? {
          name: trip.name ?? '',
          budget: trip.budget ? String(trip.budget) : '',
          team_size: trip.team_size ? String(trip.team_size) : '',
          currency: trip.currency ?? 'LKR',
          destination: trip.destination ?? '',
          start_date: trip.start_date ?? '',
          end_date: trip.end_date ?? '',
          notes: trip.notes ?? '',
        }
      : blank
  );
  const [actor, setActor] = useState(remembered);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const perPerson = Number(f.budget) > 0 && Number(f.team_size) > 0 ? Number(f.budget) / Number(f.team_size) : 0;
  const cur = (f.currency || 'LKR').toUpperCase();

  async function submit(e) {
    e.preventDefault();
    setShow(true);
    const problem = tripFormError(f) || actorError(actor);
    setError(problem || '');
    if (problem) return;
    setBusy(true);
    try {
      await onSave({ ...f, currency: cur, actor });
      rememberActor(actor);
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const err = (cond, msg) => (show && cond ? msg : null);

  return (
    <form onSubmit={submit} noValidate className="stack">
      <div className="form-grid two">
        <Field label="Trip name" required htmlFor="t-name" className="full" error={err(!f.name.trim(), 'Enter the trip name')}>
          <input id="t-name" value={f.name} onChange={set('name')} placeholder="e.g. Annual Trip 2026" maxLength={120} autoFocus={!trip} aria-invalid={show && !f.name.trim() ? 'true' : undefined} />
        </Field>
        <Field label="Total budget" required htmlFor="t-budget" error={err(!(Number(f.budget) > 0), 'Enter the total budget')} hint="The complete budget for the whole trip">
          <div className="input-prefix">
            <span>{cur === 'LKR' ? 'Rs' : cur}</span>
            <input id="t-budget" type="number" inputMode="decimal" min="0" step="0.01" value={f.budget} onChange={set('budget')} placeholder="100000" aria-invalid={show && !(Number(f.budget) > 0) ? 'true' : undefined} />
          </div>
        </Field>
        <Field
          label="Team member count"
          required
          htmlFor="t-team"
          error={err(!(Number.isInteger(Number(f.team_size)) && Number(f.team_size) >= 1 && Number(f.team_size) <= 1000), 'Enter how many people are going')}
          hint={perPerson ? `Budget per person: ${money(perPerson, cur)}` : 'How many people are going'}
        >
          <input id="t-team" type="number" inputMode="numeric" min="1" max="1000" step="1" value={f.team_size} onChange={set('team_size')} placeholder="10" />
        </Field>
        <Field label="Destination" htmlFor="t-dest">
          <input id="t-dest" value={f.destination} onChange={set('destination')} placeholder="e.g. Ella & Nuwara Eliya" maxLength={120} />
        </Field>
        <Field label="Currency" htmlFor="t-cur" hint="3-letter code" error={err(f.currency && !/^[A-Za-z]{3}$/.test(f.currency.trim()), 'Use a code like LKR')}>
          <input id="t-cur" value={f.currency} onChange={set('currency')} maxLength={3} placeholder="LKR" style={{ textTransform: 'uppercase' }} />
        </Field>
        <Field label="Start date" htmlFor="t-start">
          <input id="t-start" type="date" value={f.start_date} onChange={set('start_date')} />
        </Field>
        <Field label="End date" htmlFor="t-end" error={err(f.start_date && f.end_date && f.end_date < f.start_date, 'End date is before the start date')}>
          <input id="t-end" type="date" value={f.end_date} onChange={set('end_date')} min={f.start_date || undefined} />
        </Field>
        <Field label="Trip details & notes" htmlFor="t-notes" className="full" hint="Hotel booking reference, pickup point, emergency contacts…">
          <textarea id="t-notes" value={f.notes} onChange={set('notes')} maxLength={2000} rows={3} />
        </Field>
      </div>
      <ActorFields value={actor} onChange={setActor} members={members} showErrors={show} />
      {error && (
        <div className="alert danger">
          <Icon name="alert" />
          <div className="grow">{error}</div>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {extraActions}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
