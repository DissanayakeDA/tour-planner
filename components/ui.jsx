'use client';
// Small presentational building blocks used across pages.
import Icon from './Icon';
import { budgetStatus, initials, pct } from '@/lib/client/format';

export function PageHeader({ title, desc, actions }) {
  return (
    <div className="page-head">
      <div className="grow">
        <h1>{title}</h1>
        {desc && <p className="desc">{desc}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, sub, actions, children, foot, className = '', bodyClass = 'card-body', noBody = false }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <h2>
            {title} {sub && <span className="sub">{sub}</span>}
          </h2>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {noBody ? children : <div className={bodyClass}>{children}</div>}
      {foot && <div className="card-foot">{foot}</div>}
    </section>
  );
}

export function Kpi({ label, value, sub, icon, tone = 'primary', valueClass = '' }) {
  return (
    <div className="card kpi">
      <div className="top">
        <span className="label">{label}</span>
        {icon && (
          <span className={`chip tone-${tone}`}>
            <Icon name={icon} />
          </span>
        )}
      </div>
      <div className={`value ${valueClass}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', icon, children }) {
  return (
    <span className={`badge ${tone}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function Progress({ value, max, tone, large = false }) {
  const p = Math.min(100, pct(value, max));
  const t = tone ?? (max > 0 ? budgetStatus(value, max).tone : 'primary');
  return (
    <div className={`progress ${t === 'neutral' ? '' : t} ${large ? 'lg' : ''}`} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${p}%` }} />
    </div>
  );
}

export function Utilisation({ spent, budget }) {
  const p = pct(spent, budget);
  return (
    <div className="util">
      <Progress value={spent} max={budget} />
      <span className="p">{budget > 0 ? `${Math.round(p)}%` : '—'}</span>
    </div>
  );
}

export function StatusBadge({ spent, budget }) {
  const s = budgetStatus(spent, budget);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function EmptyState({ icon = 'info', title, children, action }) {
  return (
    <div className="empty-state">
      <div className="icon">
        <Icon name={icon} size={24} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Alert({ tone = 'info', icon, children }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={icon ?? (tone === 'info' ? 'info' : tone === 'success' ? 'check' : 'alert')} />
      <div className="grow">{children}</div>
    </div>
  );
}

export function Avatar({ name, small = false }) {
  return <span className={`avatar ${small ? 'sm' : ''}`}>{initials(name)}</span>;
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function Field({ label, required, hint, error, children, className = '', htmlFor }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={htmlFor}>
          {label} {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}
