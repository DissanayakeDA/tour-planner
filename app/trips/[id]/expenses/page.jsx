'use client';
// Expenses register: search, filters, sortable table with totals, CSV export.
import { useMemo, useState } from 'react';
import DataTable from '@/components/DataTable';
import Icon from '@/components/Icon';
import { useToast } from '@/components/Providers';
import { useTrip } from '@/components/TripContext';
import { Badge, Card, PageHeader } from '@/components/ui';
import { download } from '@/lib/client/api';
import { fmtDate, money } from '@/lib/client/format';

export default function ExpensesPage() {
  const { detail, tripId, openDrawer } = useTrip();
  const toast = useToast();
  const { expenses, categories, members, trip } = detail;
  const cur = trip.currency;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [payer, setPayer] = useState('');
  const [missing, setMissing] = useState(false);

  const catName = (id) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized';
  const memName = (id) => (id == null ? 'Trip fund' : members.find((x) => x.id === id)?.name ?? '—');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        (!needle || [e.title, e.notes, e.created_by_name, e.created_by_phone].some((v) => v?.toLowerCase().includes(needle))) &&
        (!cat || String(e.category_id ?? 'none') === cat) &&
        (!payer || String(e.paid_by ?? 'fund') === payer) &&
        (!missing || e.bills.length === 0)
    );
  }, [expenses, q, cat, payer, missing]);
  const total = rows.reduce((s, e) => s + e.amount, 0);

  const columns = [
    { key: 'date', label: 'Date', sort: (e) => e.date, render: (e) => <span className="nowrap">{fmtDate(e.date) || '—'}</span>, hideMobile: true },
    {
      key: 'title',
      label: 'Description',
      primary: true,
      sort: (e) => e.title,
      render: (e) => (
        <div>
          <div className="cell-title">{e.title}</div>
          <div className="cell-sub">
            <span className="mobile-date">{fmtDate(e.date) || 'No date'} · </span>
            {e.notes ? e.notes.slice(0, 80) : catName(e.category_id)}
          </div>
        </div>
      ),
    },
    { key: 'cat', label: 'Category', sort: (e) => catName(e.category_id), render: (e) => catName(e.category_id) },
    { key: 'paid', label: 'Paid by', sort: (e) => memName(e.paid_by), render: (e) => (e.paid_by == null ? <Badge tone="primary">Trip fund</Badge> : memName(e.paid_by)) },
    {
      key: 'by',
      label: 'Added by',
      sort: (e) => e.created_by_name,
      render: (e) => (
        <div className="small">
          <div>{e.created_by_name || '—'}</div>
          {e.created_by_phone && <div className="xs muted">{e.created_by_phone}</div>}
        </div>
      ),
    },
    {
      key: 'bills',
      label: 'Receipts',
      sort: (e) => e.bills.length,
      render: (e) =>
        e.bills.length ? (
          <span className="row nowrap" style={{ justifyContent: 'flex-end', gap: 4 }}>
            {e.bills.slice(0, 2).map((b) => (
              <span className="thumb-mini" key={b.id}>
                {b.thumb_url ? <img src={b.thumb_url} alt="" loading="lazy" /> : 'PDF'}
              </span>
            ))}
            {e.bills.length > 2 && <span className="xs muted">+{e.bills.length - 2}</span>}
          </span>
        ) : (
          <Badge tone="warning">Missing</Badge>
        ),
    },
    { key: 'amount', label: 'Amount', align: 'r', sort: (e) => e.amount, render: (e) => <b>{money(e.amount, cur)}</b>, foot: money(total, cur) },
  ];

  async function exportCsv() {
    try {
      await download(`/trips/${tripId}/export.csv`, 'expenses.csv');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        desc="Every bill and payment for this trip. Tap a row to see receipts, edit or delete."
        actions={
          <>
            <button className="btn" onClick={exportCsv}>
              <Icon name="download" /> Export CSV
            </button>
            <button className="btn primary" onClick={() => openDrawer('expense-new')}>
              <Icon name="plus" /> New expense
            </button>
          </>
        }
      />
      <Card noBody>
        <div className="toolbar">
          <div className="search">
            <Icon name="search" />
            <input type="search" placeholder="Search description, notes or who added…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search expenses" />
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">Uncategorized</option>
          </select>
          <select value={payer} onChange={(e) => setPayer(e.target.value)} aria-label="Filter by payer">
            <option value="">Anyone paid</option>
            <option value="fund">Trip fund</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> Missing receipt
          </label>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(e) => openDrawer('expense', { id: e.id })}
          defaultSort={{ key: 'date', dir: -1 }}
          showFoot
          footLabel={`${rows.length} expense${rows.length === 1 ? '' : 's'}`}
          empty={expenses.length ? 'No expenses match these filters.' : 'No expenses yet. Add the first one or upload a bill.'}
        />
      </Card>
    </div>
  );
}
