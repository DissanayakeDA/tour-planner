'use client';
// Trip settings: edit the trip setup (name, total budget, team count, details) and the danger zone.
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import TripForm from '@/components/TripForm';
import { useToast } from '@/components/Providers';
import { useTrip } from '@/components/TripContext';
import { Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/client/format';

export default function SettingsPage() {
  const { detail, setDetail, tripId, askConfirm } = useTrip();
  const router = useRouter();
  const toast = useToast();
  const { trip, expenses, members, summary: s } = detail;

  async function save(body) {
    setDetail(await api(`/trips/${tripId}`, { method: 'PUT', body }));
    toast('Trip details saved');
  }

  const del = () =>
    askConfirm({
      title: 'Delete this whole trip?',
      children: (
        <>
          This permanently deletes <b>{trip.name}</b> with {expenses.length} expenses, {members.length} members and {s.billCount} bill files. The activity log keeps a record of who deleted it.
        </>
      ),
      typeToConfirm: trip.name,
      confirmLabel: 'Delete trip',
      onConfirm: async (actor) => {
        await api(`/trips/${tripId}`, { method: 'DELETE', body: { actor } });
        toast('Trip deleted');
        router.push('/');
      },
    });

  return (
    <div className="stack">
      <PageHeader title="Trip Settings" desc="Change the trip setup. Every change is recorded in the activity log." />
      <Card title="Trip setup" sub={trip.created_by_name ? `created by ${trip.created_by_name} · ${fmtDateTime(trip.created_at)}` : ''}>
        <TripForm key={`${trip.id}-${trip.budget}-${trip.team_size}-${trip.name}`} trip={trip} onSave={save} members={members} submitLabel="Save changes" />
      </Card>
      <Card title="Danger zone" className="danger-zone">
        <div className="row between">
          <div className="grow">
            <div className="strong">Delete trip</div>
            <p className="small muted">Removes the trip, its expenses, fund payments, members and all uploaded bills. This cannot be undone.</p>
          </div>
          <button className="btn danger" onClick={del}>
            <Icon name="trash" /> Delete trip
          </button>
        </div>
      </Card>
    </div>
  );
}
