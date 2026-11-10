'use client';
// Dashboard: budget position, team progress, alerts, category utilisation, recent expenses,
// settlement snapshot and the latest activity.
import Link from 'next/link';
import { useTrip } from '@/components/TripContext';
import { ActivityList } from '@/components/ActivityList';
import DataTable from '@/components/DataTable';
import Icon from '@/components/Icon';
import { Alert, Badge, Card, Kpi, PageHeader, Progress, StatusBadge } from '@/components/ui';
import { dateRange, fmtDate, money, pct } from '@/lib/client/format';

export default function Dashboard() {
  const { detail, tripId, openDrawer } = useTrip();
  const { trip, summary: s, expenses, members, categories } = detail;
  const cur = trip.currency;
  const m = (v) => money(v, cur);
  const base = `/trips/${tripId}`;
  const usedPct = pct(s.spent, s.budget);
  const over = s.byCategory.filter((c) => c.budget > 0 && c.spent > c.budget);
  const catName = (id) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized';
  const memName = (id) => (id == null ? 'Trip fund' : members.find((x) => x.id === id)?.name ?? '—');

  const recentCols = [
    {
      key: 'title',
      label: 'Expense',
      primary: true,
      render: (e) => (
        <div>
          <div className="cell-title">{e.title}</div>
          <div className="cell-sub">
            {fmtDate(e.date) || 'No date'} · {catName(e.category_id)}
          </div>
        </div>
      ),
    },
    { key: 'paid', label: 'Paid by', render: (e) => (e.paid_by == null ? <Badge tone="primary">Trip fund</Badge> : memName(e.paid_by)) },
    { key: 'by', label: 'Added by', hideMobile: true, render: (e) => <span className="small">{e.created_by_name || '—'}</span> },
    { key: 'bills', label: 'Receipt', render: (e) => (e.bills.length ? <Badge tone="success" icon="check">{e.bills.length}</Badge> : <Badge tone="warning">Missing</Badge>) },
    { key: 'amount', label: 'Amount', align: 'r', render: (e) => <b>{m(e.amount)}</b> },
  ];

  return (
    <div className="stack">
      <PageHeader
        title={trip.name}
        desc={[trip.destination, dateRange(trip.start_date, trip.end_date), `team of ${s.teamSize}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn" onClick={() => openDrawer('contribution')} disabled={!members.length}>
              <Icon name="wallet" /> Record payment
            </button>
            <button className="btn primary hide-desktop" onClick={() => openDrawer('expense-new', { withReceipt: true })}>
              <Icon name="upload" /> Upload bill
            </button>
          </>
        }
      />

      <div className="kpis five">
        <Kpi label="Total budget" value={m(s.budget)} sub={`${m(s.perPersonBudget)} per person`} icon="pie" />
        <Kpi label="Spent" value={m(s.spent)} sub={`${Math.round(usedPct)}% of budget · ${expenses.length} expenses`} icon="trend" tone={usedPct > 100 ? 'danger' : usedPct >= 85 ? 'warning' : 'violet'} />
        <Kpi label="Remaining" value={m(s.remaining)} valueClass={s.remaining < 0 ? 't-danger' : ''} sub={s.remaining < 0 ? 'Over budget' : 'left to spend'} icon="coins" tone={s.remaining < 0 ? 'danger' : 'success'} />
        <Kpi label="Cash in fund" value={m(s.cashInHand)} valueClass={s.cashInHand < 0 ? 't-danger' : ''} sub={`${m(s.collected)} collected`} icon="wallet" tone={s.cashInHand < 0 ? 'danger' : 'primary'} />
        <Kpi label="Team" value={`${s.membersRegistered} / ${s.teamSize}`} sub={`share so far ${m(s.perPersonShare)} each`} icon="users" tone={s.membersMissing ? 'warning' : 'success'} />
      </div>

      <Card>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="strong">Budget used</span>
          <span className="small num">
            <b>{m(s.spent)}</b> <span className="muted">of {m(s.budget)}</span>
          </span>
        </div>
        <Progress value={s.spent} max={s.budget} large />
        <div className="row between xs muted" style={{ marginTop: 6 }}>
          <span>{Math.round(usedPct)}% used</span>
          <span>{s.remaining >= 0 ? `${m(s.remaining)} remaining` : `${m(-s.remaining)} over`}</span>
        </div>
      </Card>

      {(s.membersMissing > 0 || over.length > 0 || s.expensesWithoutBills > 0 || s.cashInHand < 0) && (
        <div className="stack-sm">
          {s.membersMissing > 0 && (
            <Alert tone="info" icon="users">
              {s.membersRegistered} of {s.teamSize} team members added. <Link href={`${base}/members`}>Add the other {s.membersMissing}</Link> so costs are split correctly.
            </Alert>
          )}
          {over.map((c) => (
            <Alert key={c.id ?? 'u'} tone="danger">
              <b>{c.name}</b> is over budget: {m(c.spent)} spent of {m(c.budget)}.
            </Alert>
          ))}
          {s.expensesWithoutBills > 0 && (
            <Alert tone="warning" icon="receipt">
              {s.expensesWithoutBills} expense{s.expensesWithoutBills > 1 ? 's have' : ' has'} no bill attached. <Link href={`${base}/bills`}>Attach bills</Link>
            </Alert>
          )}
          {s.cashInHand < 0 && <Alert tone="danger">More has been paid from the trip fund than was collected ({m(s.cashInHand)}).</Alert>}
        </div>
      )}

      <div className="grid-2">
        <Card title="Budget by category" actions={<Link href={`${base}/budget`} className="small">Manage →</Link>} noBody>
          {s.byCategory.map((c) => (
            <div className="cat-row" key={c.id ?? 'uncat'}>
              <div className="row between nowrap">
                <span className="strong truncate">{c.name}</span>
                <span className="small num nowrap">
                  {m(c.spent)} {c.budget > 0 && <span className="muted">/ {m(c.budget)}</span>}
                </span>
              </div>
              {c.budget > 0 ? (
                <div className="row nowrap">
                  <div className="grow">
                    <Progress value={c.spent} max={c.budget} />
                  </div>
                  <StatusBadge spent={c.spent} budget={c.budget} />
                </div>
              ) : (
                <span className="xs muted">No budget set for this category</span>
              )}
            </div>
          ))}
        </Card>

        <Card title="Settlement snapshot" actions={<Link href={`${base}/settlement`} className="small">Details →</Link>} noBody>
          {!members.length ? (
            <p className="card-body muted small">Add team members to see who owes whom.</p>
          ) : s.settlements.length === 0 ? (
            <p className="card-body small">
              <Badge tone="success" icon="check">Settled</Badge> Everyone is square right now.
            </p>
          ) : (
            s.settlements.slice(0, 6).map((t, i) => (
              <div className="transfer" key={i}>
                <span className="strong truncate">{t.from}</span>
                <Icon name="arrowRight" className="ic arrow" />
                <span className="truncate">{t.to}</span>
                <span className="amt">{m(t.amount)}</span>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Recent expenses" actions={<Link href={`${base}/expenses`} className="small">View all →</Link>} noBody>
          <DataTable columns={recentCols} rows={expenses.slice(0, 8)} onRowClick={(e) => openDrawer('expense', { id: e.id })} empty="No expenses yet. Tap “Upload bill” to add the first one." />
        </Card>
        <Card title="Recent activity" actions={<Link href={`${base}/activity`} className="small">Full log →</Link>} noBody>
          {detail.recentActivity.length ? <ActivityList items={detail.recentActivity} /> : <p className="card-body muted small">No changes yet.</p>}
        </Card>
      </div>

      {trip.notes && (
        <Card title="Trip details & notes">
          <p style={{ whiteSpace: 'pre-wrap' }}>{trip.notes}</p>
        </Card>
      )}
    </div>
  );
}
