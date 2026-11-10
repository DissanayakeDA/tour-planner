'use client';
// Settlement: equal split explanation, balances, minimal transfers, copy-to-WhatsApp summary.
import DataTable from '@/components/DataTable';
import Icon from '@/components/Icon';
import { useToast } from '@/components/Providers';
import { useTrip } from '@/components/TripContext';
import { Alert, Badge, Card, EmptyState, Kpi, PageHeader } from '@/components/ui';
import { money } from '@/lib/client/format';

export default function SettlementPage() {
  const { detail } = useTrip();
  const toast = useToast();
  const { summary: s, trip, members } = detail;
  const cur = trip.currency;
  const m = (v) => money(v, cur);

  function summaryText() {
    const lines = [
      `Trip Kitty — ${trip.name}`,
      `Total spent: ${m(s.spent)} of ${m(s.budget)} budget`,
      `Share per person: ${m(s.perPersonShare)} (${members.length} people)`,
      `Cash left in fund: ${m(s.cashInHand)}`,
      '',
    ];
    if (s.settlements.length) {
      lines.push('Who pays whom:');
      for (const t of s.settlements) lines.push(`• ${t.from} → ${t.to}: ${m(t.amount)}`);
    } else lines.push('Everyone is settled ✅');
    return lines.join('\n');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText());
      toast('Summary copied. Paste it into your group chat.');
    } catch {
      toast('Could not copy. Select the text manually.', 'error');
    }
  }

  const cols = [
    { key: 'name', label: 'Member', primary: true, sort: (b) => b.name, render: (b) => <span className="cell-title">{b.name}</span> },
    { key: 'in', label: 'Put in fund', align: 'r', render: (b) => m(b.contributed) },
    { key: 'paid', label: 'Paid personally', align: 'r', render: (b) => m(b.paidPersonally) },
    { key: 'share', label: 'Share', align: 'r', render: (b) => m(b.share) },
    {
      key: 'bal',
      label: 'Balance',
      align: 'r',
      sort: (b) => b.balance,
      render: (b) =>
        b.balance > 0.004 ? <Badge tone="success">+{m(b.balance)}</Badge> : b.balance < -0.004 ? <Badge tone="danger">−{m(-b.balance)}</Badge> : <Badge tone="neutral">0</Badge>,
    },
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Settlement"
        desc="Costs are shared equally. This shows the fewest payments needed to even everything out."
        actions={
          <button className="btn primary" onClick={copy} disabled={!members.length}>
            <Icon name="copy" /> Copy for WhatsApp
          </button>
        }
      />
      <div className="kpis four">
        <Kpi label="Total spent" value={m(s.spent)} icon="trend" tone="violet" />
        <Kpi label="Members" value={members.length} sub={s.membersMissing ? `${s.membersMissing} not added yet` : 'whole team'} icon="users" tone={s.membersMissing ? 'warning' : 'success'} />
        <Kpi label="Share per person" value={m(s.perPersonShare)} icon="scale" />
        <Kpi label="Cash left in fund" value={m(s.cashInHand)} sub="returned in the transfers" icon="wallet" tone="neutral" />
      </div>
      {s.membersMissing > 0 && <Alert tone="warning">Only {s.membersRegistered} of {s.teamSize} members are added, so each share is based on {s.membersRegistered} people. Add everyone for a correct split.</Alert>}
      <div className="grid-2">
        <Card title="Who pays whom" noBody>
          {!members.length ? (
            <EmptyState icon="users" title="No members yet" />
          ) : s.settlements.length === 0 ? (
            <EmptyState icon="check" title="Everyone is settled" />
          ) : (
            s.settlements.map((t, i) => (
              <div className="transfer" key={i}>
                <span className="strong truncate">{t.from}</span>
                <Icon name="arrowRight" className="ic arrow" />
                <span className="truncate">{t.to}</span>
                <span className="amt">{m(t.amount)}</span>
              </div>
            ))
          )}
        </Card>
        <Card title="How it is calculated">
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>
              <b>Share</b> = total spent ÷ members ({m(s.spent)} ÷ {members.length || 0}).
            </li>
            <li>
              <b>Balance</b> = what you put in the fund + what you paid personally − your share.
            </li>
            <li>A positive balance means you get money back; negative means you still owe.</li>
            <li>Any cash left in the trip fund is handed back as part of the transfers.</li>
          </ul>
        </Card>
      </div>
      <Card title="Member balances" noBody>
        <DataTable columns={cols} rows={s.byMember} empty="No members yet." defaultSort={{ key: 'bal', dir: -1 }} />
      </Card>
    </div>
  );
}
