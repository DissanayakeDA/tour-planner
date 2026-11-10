'use client';
// Budget: the complete trip budget split into categories, with utilisation and status.
import Link from 'next/link';
import DataTable from '@/components/DataTable';
import Icon from '@/components/Icon';
import { useTrip } from '@/components/TripContext';
import { Alert, Card, Kpi, PageHeader, Progress, StatusBadge, Utilisation } from '@/components/ui';
import { money } from '@/lib/client/format';

export default function BudgetPage() {
  const { detail, tripId, openDrawer } = useTrip();
  const { summary: s, trip } = detail;
  const cur = trip.currency;
  const m = (v) => money(v, cur);
  const allocated = s.categoryBudget;
  const unallocated = s.budget - allocated;

  const cols = [
    { key: 'name', label: 'Category', primary: true, sort: (c) => c.name, render: (c) => <span className="cell-title">{c.name}</span> },
    { key: 'budget', label: 'Budget', align: 'r', sort: (c) => c.budget, render: (c) => (c.budget > 0 ? m(c.budget) : <span className="muted">—</span>), foot: m(allocated) },
    { key: 'spent', label: 'Spent', align: 'r', sort: (c) => c.spent, render: (c) => m(c.spent), foot: m(s.spent) },
    {
      key: 'rem',
      label: 'Remaining',
      align: 'r',
      sort: (c) => c.budget - c.spent,
      render: (c) => (c.budget > 0 ? <span className={c.budget - c.spent < 0 ? 't-danger' : ''}>{m(c.budget - c.spent)}</span> : <span className="muted">—</span>),
    },
    { key: 'util', label: 'Utilisation', sort: (c) => (c.budget > 0 ? c.spent / c.budget : -1), render: (c) => <Utilisation spent={c.spent} budget={c.budget} /> },
    { key: 'status', label: 'Status', render: (c) => <StatusBadge spent={c.spent} budget={c.budget} /> },
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Budget"
        desc="Split the complete trip budget into categories and watch spending against each one."
        actions={
          <>
            <Link href={`/trips/${tripId}/settings`} className="btn">
              <Icon name="edit" /> Change total budget
            </Link>
            <button className="btn primary" onClick={() => openDrawer('category')}>
              <Icon name="plus" /> Add category
            </button>
          </>
        }
      />
      <div className="kpis four">
        <Kpi label="Total budget" value={m(s.budget)} sub={`${m(s.perPersonBudget)} per person`} icon="pie" />
        <Kpi label="Allocated to categories" value={m(allocated)} sub={s.budget > 0 ? `${Math.round((allocated / s.budget) * 100)}% of total` : ''} icon="filter" tone="violet" />
        <Kpi label="Unallocated" value={m(unallocated)} valueClass={unallocated < 0 ? 't-danger' : ''} sub={unallocated < 0 ? 'Categories exceed the total' : 'not yet planned'} icon="coins" tone={unallocated < 0 ? 'danger' : 'neutral'} />
        <Kpi label="Remaining overall" value={m(s.remaining)} valueClass={s.remaining < 0 ? 't-danger' : ''} sub={`${m(s.spent)} spent`} icon="trend" tone={s.remaining < 0 ? 'danger' : 'success'} />
      </div>
      <Card>
        <div className="row between" style={{ marginBottom: 6 }}>
          <span className="strong small">Total budget used</span>
          <StatusBadge spent={s.spent} budget={s.budget} />
        </div>
        <Progress value={s.spent} max={s.budget} large />
      </Card>
      {unallocated < 0 && <Alert tone="warning">Category budgets add up to {m(allocated)}, which is more than the total budget of {m(s.budget)}.</Alert>}
      <Card noBody>
        <DataTable columns={cols} rows={s.byCategory} rowKey={(c) => c.id ?? 'uncat'} onRowClick={(c) => c.id && openDrawer('category', { id: c.id })} showFoot />
      </Card>
    </div>
  );
}
