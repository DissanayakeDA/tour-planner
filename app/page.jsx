'use client';
// All Trips: register of every trip with budget utilisation, plus recent activity across trips.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import DataTable from '@/components/DataTable';
import Icon from '@/components/Icon';
import { ActivityList } from '@/components/ActivityList';
import { Badge, Card, EmptyState, Loading, PageHeader, StatusBadge, Utilisation } from '@/components/ui';
import { api } from '@/lib/client/api';
import { dateRange, money } from '@/lib/client/format';

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/trips')
      .then(setTrips)
      .catch((e) => setError(e.message));
    api('/activity?limit=12')
      .then(setActivity)
      .catch(() => {});
  }, []);

  const newBtn = (
    <Link href="/trips/new" className="btn primary">
      <Icon name="plus" /> New trip
    </Link>
  );

  const columns = [
    {
      key: 'name',
      label: 'Trip',
      primary: true,
      sort: (t) => t.name,
      render: (t) => (
        <div>
          <div className="cell-title">{t.name}</div>
          <div className="cell-sub">{[t.destination, dateRange(t.start_date, t.end_date)].filter(Boolean).join(' · ') || 'No dates yet'}</div>
        </div>
      ),
    },
    {
      key: 'team',
      label: 'Team',
      sort: (t) => t.member_count,
      render: (t) => (
        <span className="num">
          {t.member_count}
          {t.team_size ? <span className="muted"> / {t.team_size}</span> : null}
        </span>
      ),
    },
    { key: 'budget', label: 'Budget', align: 'r', sort: (t) => t.total_budget, render: (t) => money(t.total_budget, t.currency) },
    { key: 'spent', label: 'Spent', align: 'r', sort: (t) => t.spent, render: (t) => money(t.spent, t.currency) },
    { key: 'util', label: 'Utilisation', sort: (t) => (t.total_budget > 0 ? t.spent / t.total_budget : -1), render: (t) => <Utilisation spent={t.spent} budget={t.total_budget} /> },
    { key: 'status', label: 'Status', render: (t) => <StatusBadge spent={t.spent} budget={t.total_budget} /> },
  ];

  return (
    <AppShell crumbs={[{ label: 'All Trips' }]} actions={<span className="hide-xs">{newBtn}</span>}>
      <PageHeader title="Trips" desc="Every trip your group manages here. Open one to manage its budget, bills and team." actions={newBtn} />
      {error && <div className="alert danger" style={{ marginBottom: 16 }}>{error}</div>}
      {!trips && !error ? (
        <Loading />
      ) : trips && trips.length === 0 ? (
        <Card>
          <EmptyState icon="suitcase" title="Set up your first trip" action={newBtn}>
            Enter the trip name, the complete budget (for example Rs 100,000) and how many people are going. Then add the team and start uploading bills.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid-2">
          <Card title="Trip register" sub={trips ? `${trips.length} trip${trips.length === 1 ? '' : 's'}` : ''} noBody>
            <DataTable columns={columns} rows={trips ?? []} onRowClick={(t) => router.push(`/trips/${t.id}`)} />
          </Card>
          <Card title="Recent activity" sub="all trips" noBody>
            {activity.length ? <ActivityList items={activity} showTrip /> : <p className="card-body muted small">No changes recorded yet.</p>}
          </Card>
        </div>
      )}
      <p className="xs muted" style={{ marginTop: 16 }}>
        <Badge tone="primary" icon="shield">No login</Badge> Everyone who makes a change enters their name and phone number, and every change is kept in the activity log.
      </p>
    </AppShell>
  );
}
