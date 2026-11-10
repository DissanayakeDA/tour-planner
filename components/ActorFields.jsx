'use client';
// "Who is making this change?" — name + phone, required on every change (there is no login).
// Prefilled with the last values used on this device; typing a team member's name fills their phone.
import { useId } from 'react';
import Icon from './Icon';

export function normalisePhone(p) {
  return String(p || '').replace(/[\s\-().]/g, '');
}

/** Same rules as the server (lib/validate.js actorOf). Returns an error message or null. */
export function actorError(a) {
  const name = (a?.name || '').trim();
  const phone = normalisePhone(a?.phone);
  if (!name) return 'Enter your name';
  if (name.length < 2) return 'Your name must be at least 2 characters';
  if (!phone) return 'Enter your phone number';
  if (!/^\+?\d{9,15}$/.test(phone)) return 'Enter a valid phone number, e.g. 0771234567';
  return null;
}

export default function ActorFields({ value, onChange, members = [], showErrors = false, compact = false }) {
  const id = useId();
  const name = value?.name ?? '';
  const phone = value?.phone ?? '';
  const nameErr = showErrors && (!name.trim() ? 'Enter your name' : name.trim().length < 2 ? 'At least 2 characters' : null);
  const phoneNorm = normalisePhone(phone);
  const phoneErr = showErrors && (!phoneNorm ? 'Enter your phone number' : !/^\+?\d{9,15}$/.test(phoneNorm) ? 'Use 9–15 digits, e.g. 0771234567' : null);

  function setName(v) {
    const m = members.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
    onChange({ name: v, phone: m?.phone && !phone ? m.phone : phone });
  }

  return (
    <div className="actor-box">
      <div className="title">
        <Icon name="user" /> Who is making this change?
      </div>
      <div className={`form-grid ${compact ? '' : 'two'}`}>
        <div className="field">
          <label htmlFor={`${id}-n`}>
            Your name <span className="req">*</span>
          </label>
          <input
            id={`${id}-n`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            list={members.length ? `${id}-list` : undefined}
            placeholder="e.g. Amal Perera"
            aria-invalid={nameErr ? 'true' : undefined}
            maxLength={80}
          />
          {members.length > 0 && (
            <datalist id={`${id}-list`}>
              {members.map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>
          )}
          {nameErr && <div className="err">{nameErr}</div>}
        </div>
        <div className="field">
          <label htmlFor={`${id}-p`}>
            Your phone <span className="req">*</span>
          </label>
          <input
            id={`${id}-p`}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => onChange({ name, phone: e.target.value })}
            autoComplete="tel"
            placeholder="07X XXX XXXX"
            aria-invalid={phoneErr ? 'true' : undefined}
            maxLength={40}
          />
          {phoneErr && <div className="err">{phoneErr}</div>}
        </div>
      </div>
      <p className="note">Saved in the activity log with this change. Remembered on this device for next time.</p>
    </div>
  );
}
