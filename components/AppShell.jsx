'use client';
// ERP shell: sidebar (fixed on desktop, off-canvas on phones/tablets), sticky top bar with
// breadcrumbs, and a bottom tab bar on phones with a big "+" to upload a bill.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';
import Icon from './Icon';
import { useActor } from './Providers';
import { useTrip } from './TripContext';
import { api } from '@/lib/client/api';

export const MODULES = [
  { slug: '', label: 'Dashboard', icon: 'dashboard' },
  { slug: 'expenses', label: 'Expenses', icon: 'receipt', count: (d) => d.expenses.length },
  { slug: 'bills', label: 'Bills & Receipts', icon: 'bills', count: (d) => d.summary.billCount },
  { slug: 'members', label: 'Team Members', icon: 'users', count: (d) => `${d.summary.membersRegistered}/${d.summary.teamSize}` },
  { slug: 'fund', label: 'Fund Collections', icon: 'wallet' },
  { slug: 'budget', label: 'Budget', icon: 'pie' },
  { slug: 'settlement', label: 'Settlement', icon: 'scale' },
  { slug: 'activity', label: 'Activity Log', icon: 'history' },
  { slug: 'reports', label: 'Reports', icon: 'report' },
  { slug: 'settings', label: 'Trip Settings', icon: 'settings' },
];

function TripSwitcher({ currentId }) {
  const router = useRouter();
  const [trips, setTrips] = useState(null);
  useEffect(() => {
    api('/trips').then(setTrips).catch(() => setTrips([]));
  }, [currentId]);
  if (!trips || trips.length < 2) return null;
  return (
    <select aria-label="Switch trip" value={currentId} onChange={(e) => router.push(`/trips/${e.target.value}`)}>
      {trips.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export default function AppShell({ children, crumbs = [], actions }) {
  const pathname = usePathname();
  const trip = useTrip();
  const { actor } = useActor();
  const [open, setOpen] = useState(false);
  const detail = trip?.detail;
  const base = trip ? `/trips/${trip.tripId}` : null;
  const moduleSlug = base && pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '').split('/')[0] : null;

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (slug) => moduleSlug === slug;

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sb-brand">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Icon name="logo" size={20} />
            </span>
            Trip Kitty
          </Link>
          <button className="btn-icon sb-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>
        <div className="sb-scroll">
          <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`}>
            <Icon name="suitcase" /> All Trips
          </Link>
          <Link href="/trips/new" className={`nav-item ${pathname === '/trips/new' ? 'active' : ''}`}>
            <Icon name="plus" /> New Trip
          </Link>
          {trip && (
            <>
              <div className="sb-label">Current trip</div>
              <div className="sb-trip">
                <div className="name truncate">{detail?.trip.name ?? 'Loading…'}</div>
                {detail && (
                  <div className="xs muted">
                    {detail.trip.destination || 'No destination'} · team of {detail.summary.teamSize}
                  </div>
                )}
                <TripSwitcher currentId={trip.tripId} />
              </div>
              <div className="sb-label">Modules</div>
              <nav aria-label="Trip modules">
                {MODULES.map((m) => (
                  <Link key={m.slug} href={`${base}${m.slug ? `/${m.slug}` : ''}`} className={`nav-item ${isActive(m.slug) ? 'active' : ''}`} aria-current={isActive(m.slug) ? 'page' : undefined}>
                    <Icon name={m.icon} /> {m.label}
                    {detail && m.count && <span className="count">{m.count(detail)}</span>}
                  </Link>
                ))}
              </nav>
            </>
          )}
        </div>
        <div className="sb-foot">
          {actor?.name ? (
            <div className="row nowrap">
              <Icon name="user" size={14} />
              <span className="truncate">
                Using as <b style={{ color: 'var(--text-2)' }}>{actor.name}</b>
                {actor.phone ? ` · ${actor.phone}` : ''}
              </span>
            </div>
          ) : (
            <span>No login needed. You enter your name and phone when you make a change.</span>
          )}
        </div>
      </aside>
      {open && <button className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="btn-icon hamburger" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
            <Icon name="menu" />
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              // Phones show only the current page; wider screens show the whole trail.
              return (
                <Fragment key={i}>
                  {i > 0 && <span className="sep hide-sm">/</span>}
                  {c.href && !last ? (
                    <Link href={c.href} className="hide-sm">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="current">{c.label}</span>
                  )}
                </Fragment>
              );
            })}
          </nav>
          <div className="top-actions">{actions}</div>
        </header>
        <main className="view" id="main">
          {children}
        </main>
      </div>

      {trip && (
        <nav className="bottom-nav" aria-label="Quick navigation">
          <Link href={base} className={`bn-item ${isActive('') ? 'active' : ''}`}>
            <Icon name="dashboard" /> Dashboard
          </Link>
          <Link href={`${base}/expenses`} className={`bn-item ${isActive('expenses') ? 'active' : ''}`}>
            <Icon name="receipt" /> Expenses
          </Link>
          <button className="bn-item bn-add" onClick={() => trip.openDrawer('expense-new', { withReceipt: true })} aria-label="Upload bill" disabled={!detail}>
            <span>
              <Icon name="plus" size={22} />
            </span>
          </button>
          <Link href={`${base}/bills`} className={`bn-item ${isActive('bills') ? 'active' : ''}`}>
            <Icon name="bills" /> Bills
          </Link>
          <button className="bn-item" onClick={() => setOpen(true)}>
            <Icon name="menu" /> More
          </button>
        </nav>
      )}
    </div>
  );
}
