'use client';
// Fund collections: money each member handed over to the common trip fund.
import DataTable from '@/components/DataTable';
import Icon from '@/components/Icon';
import { useTrip } from '@/components/TripContext';
import { Alert, Card, EmptyState, Kpi, PageHeader, Progress } from '@/components/ui';
import { fmtDate, money } from '@/lib/client/format';

export default function FundPage() {
  const { detail, openDrawer } = useTrip();
  const { contributions, members, summary: s, trip } = detail;
  const cur = trip.currency;
  const memName = (id) => members.find((m) => m.id === id)?.name ?? '—';
  const target = s.perPersonBudget;

  const cols = [
    { key: 'date', label: 'Date', sort: (c) => c.date, render: (c) => fmtDate(c.date) || '—' },
    {
      key: 'member',
      label: 'Member',
      primary: true,
      sort: (c) => memName(c.member_id),
      render: (c) => (
        <div>
          <div className="cell-title">{memName(c.member_id)}</div>
          {c.note && <div className="cell-sub">{c.note}</div>}
        </div>
      ),
    },
    {
      key: 'by',
      label: 'Recorded by',
      render: (c) => (
        <div className="small">
          <div>{c.created_by_name || '—'}</div>
          {c.created_by_phone && <div className="xs muted">{c.created_by_phone}</div>}
        </div>
      ),
    },
    { key: 'amount', label: 'Amount', align: 'r', sort: (c) => c.amount, render: (c) => <b>{money(c.amount, cur)}</b>, foot: money(s.collected, cur) },
  ];

  const perMember = s.byMember.map((b) => ({ ...b, phone: members.find((m) => m.id === b.id)?.phone }));
  const memberCols = [
    { key: 'name', label: 'Member', primary: true, sort: (b) => b.name, render: (b) => <span className="cell-title">{b.name}</span> },
    { key: 'in', label: 'Collected', align: 'r', sort: (b) => b.contributed, render: (b) => money(b.contributed, cur) },
    ...(target > 0
      ? [
          {
            key: 'target',
            label: `vs ${money(target, cur)}`,
            render: (b) => (
              <div className="util">
                <Progress value={b.contributed} max={target} tone={b.contributed >= target ? 'success' : 'warning'} />
                <span className="p">{Math.round((b.contributed / target) * 100)}%</span>
              </div>
            ),
          },
          { key: 'due', label: 'Still due', align: 'r', sort: (b) => target - b.contributed, render: (b) => (b.contributed >= target ? <span className="t-success">—</span> : money(target - b.contributed, cur)) },
        ]
      : []),
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Fund Collections"
        desc="Money members put into the common trip fund (the kitty). Expenses marked “Trip fund” are paid from it."
        actions={
          <button className="btn primary" onClick={() => openDrawer('contribution')} disabled={!members.length}>
            <Icon name="plus" /> Record payment
          </button>
        }
      />
      <div className="kpis four">
        <Kpi label="Collected" value={money(s.collected, cur)} sub={`${contributions.length} payments`} icon="coins" tone="success" />
        <Kpi label="Spent from fund" value={money(s.fundSpent, cur)} icon="receipt" tone="violet" />
        <Kpi label="Cash in hand" value={money(s.cashInHand, cur)} valueClass={s.cashInHand < 0 ? 't-danger' : ''} icon="wallet" tone={s.cashInHand < 0 ? 'danger' : 'primary'} />
        <Kpi label="Target per person" value={money(target, cur)} sub="total budget ÷ team size" icon="pie" tone="neutral" />
      </div>
      {!members.length && <Alert tone="info">Add team members first, then record what each person paid into the fund.</Alert>}
      <div className="grid-2">
        <Card title="Payments" noBody>
          {contributions.length === 0 ? (
            <EmptyState icon="wallet" title="No payments recorded" />
          ) : (
            <DataTable columns={cols} rows={contributions} onRowClick={(c) => openDrawer('contribution', { id: c.id })} defaultSort={{ key: 'date', dir: -1 }} showFoot />
          )}
        </Card>
        <Card title="By member" noBody>
          <DataTable columns={memberCols} rows={perMember} onRowClick={(b) => openDrawer('contribution', { memberId: b.id })} empty="No members yet." />
        </Card>
      </div>
    </div>
  );
}
