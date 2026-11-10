'use client';
// Shell for every trip module: loads the trip once (TripProvider) and frames pages in the ERP layout.
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import AppShell, { MODULES } from '@/components/AppShell';
import Icon from '@/components/Icon';
import { TripProvider, useTrip } from '@/components/TripContext';
import { Card, EmptyState, Loading } from '@/components/ui';

function Frame({ children }) {
  const { detail, error, tripId, openDrawer } = useTrip();
  const pathname = usePathname();
  const slug = pathname.split('/')[3] ?? '';
  const mod = MODULES.find((m) => m.slug === slug) ?? MODULES[0];
  const crumbs = [{ label: 'All Trips', href: '/' }, { label: detail?.trip.name ?? 'Trip', href: `/trips/${tripId}` }, { label: mod.label }];

  let body = children;
  if (error && !detail) {
    body = (
      <Card>
        <EmptyState
          icon="alert"
          title={error.status === 404 ? 'Trip not found' : 'Could not load this trip'}
          action={
            <Link className="btn" href="/">
              Back to all trips
            </Link>
          }
        >
          {error.status === 404 ? 'It may have been deleted. Check the activity log on the trips page.' : error.message}
        </EmptyState>
      </Card>
    );
  } else if (!detail) {
    body = <Loading label="Loading trip…" />;
  }

  return (
    <AppShell
      crumbs={crumbs}
      actions={
        detail && (
          <button className="btn primary desktop-only" onClick={() => openDrawer('expense-new', { withReceipt: true })}>
            <Icon name="upload" /> Upload bill
          </button>
        )
      }
    >
      {body}
    </AppShell>
  );
}

export default function TripLayout({ children }) {
  const { id } = useParams();
  const valid = /^[1-9]\d{0,9}$/.test(String(id));
  if (!valid) {
    return (
      <AppShell crumbs={[{ label: 'All Trips', href: '/' }, { label: 'Not found' }]}>
        <Card>
          <EmptyState icon="alert" title="Trip not found" action={<Link className="btn" href="/">Back to all trips</Link>} />
        </Card>
      </AppShell>
    );
  }
  return (
    <TripProvider tripId={Number(id)}>
      <Frame>{children}</Frame>
    </TripProvider>
  );
}
