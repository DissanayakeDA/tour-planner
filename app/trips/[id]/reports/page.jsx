'use client';
// Printable trip report (Print / Save as PDF) + CSV exports.
import DataTable from '@/components/DataTable';
import Icon from '@/components/Icon';
import { useToast } from '@/components/Providers';
import { useTrip } from '@/components/TripContext';
import { Card, PageHeader, StatusBadge } from '@/components/ui';
import { download } from '@/lib/client/api';
import { dateRange, fmtDate, fmtDateTime, money } from '@/lib/client/format';

export default function ReportsPage() {
  const { detail, tripId } = useTrip();
  const toast = useToast();
  const { trip, summary: s, expenses, categories, members } = detail;
  const cur = trip.currency;
  const m = (v) => money(v, cur);
  const catName = (id) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized';
  const memName = (id) => (id == null ? 'Trip fund' : members.find((x) => x.id === id)?.name ?? '—');

  const dl = (path, name) => download(path, name).catch((e) => toast(e.message, 'error'));

  return (
    <div className="stack">
      <div className="no-print">
        <PageHeader
          title="Reports"
          desc="A complete summary of the trip you can print or save as PDF, plus spreadsheet exports."
          actions={
            <>
              <button className="btn" onClick={() => dl(`/trips/${tripId}/export.csv`, 'expenses.csv')}>
                <Icon name="download" /> Expenses CSV
              </button>
              <button className="btn" onClick={() => dl(`/trips/${tripId}/activity.csv`, 'activity.csv')}>
                <Icon name="download" /> Activity CSV
              </button>
              <button className="btn primary" onClick={() => window.print()}>
                <Icon name="print" /> Print / Save PDF
              </button>
            </>
          }
        />
      </div>

      <Card>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.3rem' }}>{trip.name}</h1>
            <p className="muted small">{[trip.destination, dateRange(trip.start_date, trip.end_date), `team of ${s.teamSize}`].filter(Boolean).join(' · ')}</p>
          </div>
          <p className="xs muted">Generated {fmtDateTime(new Date().toISOString())}</p>
        </div>
        <dl className="kv" style={{ marginTop: 14 }}>
          <dt>Total budget</dt>
          <dd>{m(s.budget)}</dd>
          <dt>Budget per person</dt>
          <dd>{m(s.perPersonBudget)}</dd>
          <dt>Total spent</dt>
          <dd>{m(s.spent)}</dd>
          <dt>Remaining</dt>
          <dd className={s.remaining < 0 ? 't-danger' : ''}>{m(s.remaining)}</dd>
          <dt>Collected into fund</dt>
          <dd>{m(s.collected)}</dd>
          <dt>Cash in fund</dt>
          <dd>{m(s.cashInHand)}</dd>
          <dt>Share per member ({members.length})</dt>
          <dd>{m(s.perPersonShare)}</dd>
          <dt>Bills attached</dt>
          <dd>
            {s.billCount} ({s.expensesWithoutBills} expenses without a bill)
          </dd>
        </dl>
      </Card>

      <Card title="Budget by category" noBody>
        <DataTable
          rowKey={(c) => c.id ?? 'u'}
          rows={s.byCategory}
          showFoot
          columns={[
            { key: 'name', label: 'Category', primary: true, render: (c) => <b>{c.name}</b> },
            { key: 'budget', label: 'Budget', align: 'r', render: (c) => m(c.budget), foot: m(s.categoryBudget) },
            { key: 'spent', label: 'Spent', align: 'r', render: (c) => m(c.spent), foot: m(s.spent) },
            { key: 'status', label: 'Status', render: (c) => <StatusBadge spent={c.spent} budget={c.budget} /> },
          ]}
        />
      </Card>

      <Card title="Member balances & settlement" noBody>
        <DataTable
          rows={s.byMember}
          columns={[
            { key: 'name', label: 'Member', primary: true, render: (b) => <b>{b.name}</b> },
            { key: 'in', label: 'Put in fund', align: 'r', render: (b) => m(b.contributed) },
            { key: 'paid', label: 'Paid personally', align: 'r', render: (b) => m(b.paidPersonally) },
            { key: 'share', label: 'Share', align: 'r', render: (b) => m(b.share) },
            { key: 'bal', label: 'Balance', align: 'r', render: (b) => <b className={b.balance < 0 ? 't-danger' : b.balance > 0 ? 't-success' : ''}>{m(b.balance)}</b> },
          ]}
          empty="No members."
        />
        {s.settlements.length > 0 && (
          <div className="card-body" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="strong small" style={{ marginBottom: 6 }}>
              Transfers to settle
            </div>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {s.settlements.map((t, i) => (
                <li key={i}>
                  {t.from} → {t.to}: <b>{m(t.amount)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="All expenses" sub={`${expenses.length}`} noBody>
        <DataTable
          rows={expenses}
          showFoot
          columns={[
            { key: 'date', label: 'Date', render: (e) => fmtDate(e.date) || '—' },
            { key: 'title', label: 'Description', primary: true, render: (e) => <b>{e.title}</b> },
            { key: 'cat', label: 'Category', render: (e) => catName(e.category_id) },
            { key: 'paid', label: 'Paid by', render: (e) => memName(e.paid_by) },
            { key: 'by', label: 'Added by', render: (e) => `${e.created_by_name || '—'}${e.created_by_phone ? ` (${e.created_by_phone})` : ''}` },
            { key: 'bills', label: 'Bills', align: 'r', render: (e) => e.bills.length },
            { key: 'amount', label: 'Amount', align: 'r', render: (e) => m(e.amount), foot: m(s.spent) },
          ]}
          empty="No expenses."
        />
      </Card>
    </div>
  );
}
