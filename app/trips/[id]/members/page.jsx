'use client';
// Team members: progress against the team member count, balances, add/edit/remove.
import DataTable from '@/components/DataTable';
import Icon from '@/components/Icon';
import { useTrip } from '@/components/TripContext';
import { Alert, Avatar, Badge, Card, EmptyState, Kpi, PageHeader, Progress } from '@/components/ui';
import { money } from '@/lib/client/format';

function BalanceBadge({ v, cur }) {
  if (v > 0.004) return <Badge tone="success">+{money(v, cur)} gets back</Badge>;
  if (v < -0.004) return <Badge tone="danger">{money(-v, cur)} to pay</Badge>;
  return <Badge tone="neutral">Settled</Badge>;
}

export default function MembersPage() {
  const { detail, openDrawer } = useTrip();
  const { members, summary: s, trip } = detail;
  const cur = trip.currency;
  const byId = Object.fromEntries(s.byMember.map((b) => [b.id, b]));

  const columns = [
    {
      key: 'name',
      label: 'Member',
      primary: true,
      sort: (m) => m.name,
      render: (m) => (
        <div className="row nowrap">
          <Avatar name={m.name} />
          <div style={{ minWidth: 0 }}>
            <div className="cell-title truncate">{m.name}</div>
            {m.phone ? (
              <a className="cell-sub" href={`tel:${m.phone}`} onClick={(e) => e.stopPropagation()}>
                {m.phone}
              </a>
            ) : (
              <div className="cell-sub">No phone</div>
            )}
          </div>
        </div>
      ),
    },
    { key: 'in', label: 'Put in fund', align: 'r', sort: (m) => byId[m.id]?.contributed, render: (m) => money(byId[m.id]?.contributed, cur), foot: money(s.collected, cur) },
    { key: 'paid', label: 'Paid personally', align: 'r', sort: (m) => byId[m.id]?.paidPersonally, render: (m) => money(byId[m.id]?.paidPersonally, cur) },
    { key: 'share', label: 'Equal share', align: 'r', render: (m) => money(byId[m.id]?.share, cur) },
    { key: 'bal', label: 'Balance', align: 'r', sort: (m) => byId[m.id]?.balance, render: (m) => <BalanceBadge v={byId[m.id]?.balance ?? 0} cur={cur} /> },
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Team Members"
        desc="Everyone going on the trip. Costs are split equally between the members added here."
        actions={
          <button className="btn primary" onClick={() => openDrawer('member')}>
            <Icon name="plus" /> Add member
          </button>
        }
      />
      <div className="kpis four">
        <Kpi label="Team size" value={s.teamSize} sub="set in trip settings" icon="users" />
        <Kpi label="Members added" value={`${s.membersRegistered} / ${s.teamSize}`} sub={s.membersMissing ? `${s.membersMissing} still to add` : 'Everyone added'} icon="check" tone={s.membersMissing ? 'warning' : 'success'} />
        <Kpi label="Budget per person" value={money(s.perPersonBudget, cur)} sub={`${money(s.budget, cur)} ÷ ${s.teamSize}`} icon="pie" tone="violet" />
        <Kpi label="Share of spending" value={money(s.perPersonShare, cur)} sub="spent so far ÷ members" icon="scale" tone="primary" />
      </div>
      {s.teamSize > 0 && (
        <Card>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="strong small">Team registration</span>
            <span className="small muted">
              {s.membersRegistered} of {s.teamSize}
            </span>
          </div>
          <Progress value={s.membersRegistered} max={s.teamSize} tone={s.membersMissing ? 'warning' : 'success'} />
        </Card>
      )}
      {s.membersRegistered > s.teamSize && (
        <Alert tone="warning">
          More members are added ({s.membersRegistered}) than the team member count ({s.teamSize}). Update the count in Trip Settings.
        </Alert>
      )}
      <Card noBody>
        {members.length === 0 ? (
          <EmptyState
            icon="users"
            title="Add your team"
            action={
              <button className="btn primary" onClick={() => openDrawer('member')}>
                <Icon name="plus" /> Add first member
              </button>
            }
          >
            Add the {s.teamSize} people going on this trip with their phone numbers.
          </EmptyState>
        ) : (
          <DataTable columns={columns} rows={members} onRowClick={(m) => openDrawer('member', { id: m.id })} showFoot footLabel={`${members.length} members`} />
        )}
      </Card>
      <p className="xs muted">Balance = put in fund + paid personally − equal share. Green members get money back, red members still need to pay.</p>
    </div>
  );
}
