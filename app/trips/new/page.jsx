'use client';
// Trip setup: name, complete budget and team member count (plus optional details).
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import TripForm from '@/components/TripForm';
import { Card, PageHeader } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { api } from '@/lib/client/api';

export default function NewTripPage() {
  const router = useRouter();
  const toast = useToast();

  async function save(body) {
    const d = await api('/trips', { method: 'POST', body });
    toast('Trip created. Now add your team members.');
    router.push(`/trips/${d.trip.id}/members`);
  }

  return (
    <AppShell crumbs={[{ label: 'All Trips', href: '/' }, { label: 'New trip' }]}>
      <div className="setup-wrap">
        <div className="steps" aria-label="Setup steps">
          <span className="step on">
            <b>1</b> Trip & budget
          </span>
          <span className="line" />
          <span className="step">
            <b>2</b> Team members
          </span>
          <span className="line" />
          <span className="step">
            <b>3</b> Bills & expenses
          </span>
        </div>
        <PageHeader title="Set up a trip" desc="Start with the trip name, the complete budget and how many people are going. You can change these later." />
        <Card>
          <TripForm onSave={save} submitLabel="Create trip" />
        </Card>
      </div>
    </AppShell>
  );
}
