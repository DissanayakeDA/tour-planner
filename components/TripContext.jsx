'use client';
// Holds the current trip's full detail (single source of truth: every change returns the new
// detail) and the drawers / confirm dialogs that any trip page can open.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { store } from '@/lib/client/storage';
import { ConfirmDialog, Lightbox } from './Overlay';
import { ExpenseNewDrawer, ExpenseDrawer, MemberDrawer, CategoryDrawer, ContributionDrawer } from './forms';

const TripCtx = createContext(null);
export const useTrip = () => useContext(TripCtx);

export function TripProvider({ tripId, children }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [drawer, setDrawer] = useState(null); // {kind, ...payload}
  const [confirm, setConfirm] = useState(null); // ConfirmDialog props
  const [viewing, setViewing] = useState(null); // {bill, caption}

  const reload = useCallback(async () => {
    try {
      const d = await api(`/trips/${tripId}`);
      setDetail(d);
      setError(null);
      store.set('tk.lastTrip', String(tripId));
      return d;
    } catch (err) {
      setError(err);
      return null;
    }
  }, [tripId]);

  useEffect(() => {
    setDetail(null);
    reload();
  }, [reload]);

  const value = useMemo(
    () => ({
      tripId: Number(tripId),
      detail,
      setDetail,
      reload,
      error,
      openDrawer: (kind, payload = {}) => setDrawer({ kind, ...payload }),
      closeDrawer: () => setDrawer(null),
      askConfirm: (props) => setConfirm(props),
      viewBill: (bill, caption) => setViewing({ bill, caption }),
    }),
    [tripId, detail, reload, error]
  );

  const close = () => setDrawer(null);
  const members = detail?.members ?? [];

  return (
    <TripCtx.Provider value={value}>
      {children}
      {detail && drawer?.kind === 'expense-new' && <ExpenseNewDrawer {...drawer} onClose={close} />}
      {detail && drawer?.kind === 'expense' && <ExpenseDrawer key={drawer.id} {...drawer} onClose={close} />}
      {detail && drawer?.kind === 'member' && <MemberDrawer {...drawer} onClose={close} />}
      {detail && drawer?.kind === 'category' && <CategoryDrawer {...drawer} onClose={close} />}
      {detail && drawer?.kind === 'contribution' && <ContributionDrawer {...drawer} onClose={close} />}
      {confirm && <ConfirmDialog members={members} {...confirm} onClose={() => setConfirm(null)} />}
      {viewing && <Lightbox bill={viewing.bill} caption={viewing.caption} onClose={() => setViewing(null)} />}
    </TripCtx.Provider>
  );
}
