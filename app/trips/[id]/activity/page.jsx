'use client';
// Activity log: every change with who made it (name + phone) and when. Filter, search, export.
import { useEffect, useMemo, useState } from 'react';
import { ActivityList } from '@/components/ActivityList';
import Icon from '@/components/Icon';
import { useToast } from '@/components/Providers';
import { useTrip } from '@/components/TripContext';
import { Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { api, download } from '@/lib/client/api';

const ENTITIES = [
  ['', 'Everything'],
  ['expense', 'Expenses'],
  ['bill', 'Bills'],
  ['contribution', 'Fund'],
  ['member', 'Members'],
  ['category', 'Budget'],
  ['trip', 'Trip'],
];

export default function ActivityPage() {
  const { tripId, detail } = useTrip();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const latest = detail.recentActivity[0]?.id;

  useEffect(() => {
    api(`/trips/${tripId}/activity?limit=1000`)
      .then(setItems)
      .catch((e) => {
        setItems([]);
        toast(e.message, 'error');
      });
  }, [tripId, latest, toast]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter(
      (a) =>
        (!entity || a.entity === entity) &&
        (!action || a.action === action) &&
        (!needle || [a.actor_name, a.actor_phone, a.summary].some((v) => v?.toLowerCase().includes(needle)))
    );
  }, [items, entity, action, q]);

  const people = useMemo(() => new Set((items ?? []).map((a) => `${a.actor_name}|${a.actor_phone}`)).size, [items]);

  async function exportCsv() {
    try {
      await download(`/trips/${tripId}/activity.csv`, 'activity.csv');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Activity Log"
        desc="Every change to this trip, with the name and phone number of the person who made it."
        actions={
          <button className="btn" onClick={exportCsv}>
            <Icon name="download" /> Export CSV
          </button>
        }
      />
      <Card noBody>
        <div className="toolbar">
          <div className="search">
            <Icon name="search" />
            <input type="search" placeholder="Search name, phone or change…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search activity" />
          </div>
          <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Filter by item">
            {ENTITIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
            <option value="">All actions</option>
            <option value="create">Added</option>
            <option value="update">Edited</option>
            <option value="upload">Uploaded</option>
            <option value="delete">Deleted</option>
          </select>
          {items && (
            <span className="small muted">
              {rows.length} of {items.length} · {people} {people === 1 ? 'person' : 'people'}
            </span>
          )}
        </div>
        {!items ? <Loading /> : rows.length ? <ActivityList items={rows} /> : <EmptyState icon="history" title="No matching activity" />}
      </Card>
    </div>
  );
}
