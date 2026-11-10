'use client';
// Bills & receipts: gallery of every uploaded bill (with who uploaded it), filter by category,
// and the list of expenses still missing a bill.
import { useMemo, useState } from 'react';
import DataTable from '@/components/DataTable';
import Icon from '@/components/Icon';
import { ReceiptTile } from '@/components/forms';
import { useTrip } from '@/components/TripContext';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { fmtDate, money } from '@/lib/client/format';

export default function BillsPage() {
  const { detail, openDrawer, viewBill } = useTrip();
  const { expenses, categories, trip } = detail;
  const cur = trip.currency;
  const [cat, setCat] = useState('');
  const [who, setWho] = useState('');
  const catName = (id) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized';

  const bills = useMemo(
    () =>
      expenses
        .filter((e) => !cat || String(e.category_id ?? 'none') === cat)
        .flatMap((e) => e.bills.map((b) => ({ ...b, expense: e })))
        .filter((b) => !who || (b.uploaded_by_name || '') === who)
        .sort((a, b) => b.id - a.id),
    [expenses, cat, who]
  );
  const uploaders = useMemo(
    () => [...new Set(expenses.flatMap((e) => e.bills.map((b) => b.uploaded_by_name).filter(Boolean)))].sort(),
    [expenses]
  );
  const missing = expenses.filter((e) => e.bills.length === 0);

  const missingCols = [
    {
      key: 'title',
      label: 'Expense',
      primary: true,
      render: (e) => (
        <div>
          <div className="cell-title">{e.title}</div>
          <div className="cell-sub">
            {fmtDate(e.date) || 'No date'} · {catName(e.category_id)}
          </div>
        </div>
      ),
    },
    { key: 'by', label: 'Added by', render: (e) => e.created_by_name || '—' },
    { key: 'amount', label: 'Amount', align: 'r', render: (e) => money(e.amount, cur) },
    {
      key: 'act',
      label: '',
      align: 'r',
      render: (e) => (
        <button
          className="btn sm"
          onClick={(ev) => {
            ev.stopPropagation();
            openDrawer('expense', { id: e.id });
          }}
        >
          <Icon name="upload" /> Attach
        </button>
      ),
    },
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Bills & Receipts"
        desc="Photos and PDFs of every bill, with who uploaded them. Choose the bill category when you upload."
        actions={
          <button className="btn primary" onClick={() => openDrawer('expense-new', { withReceipt: true, categoryId: cat && cat !== 'none' ? cat : '' })}>
            <Icon name="upload" /> Upload bill
          </button>
        }
      />

      <Card noBody>
        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="Bill category" style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>
              All
            </button>
            {categories.map((c) => (
              <button key={c.id} className={cat === String(c.id) ? 'on' : ''} onClick={() => setCat(String(c.id))}>
                {c.name}
              </button>
            ))}
          </div>
          <span className="spacer" />
          {uploaders.length > 1 && (
            <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by uploader">
              <option value="">Uploaded by anyone</option>
              {uploaders.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}
          <span className="small muted">{bills.length} file{bills.length === 1 ? '' : 's'}</span>
        </div>
        <div className="card-body">
          {bills.length === 0 ? (
            <EmptyState
              icon="bills"
              title={cat || who ? 'No bills for this filter' : 'No bills uploaded yet'}
              action={
                <button className="btn primary" onClick={() => openDrawer('expense-new', { withReceipt: true, categoryId: cat && cat !== 'none' ? cat : '' })}>
                  <Icon name="camera" /> Upload a bill
                </button>
              }
            >
              Choose the category, enter the amount, add the photo and your name and phone.
            </EmptyState>
          ) : (
            <div className="receipts">
              {bills.map((b) => (
                <ReceiptTile
                  key={b.id}
                  bill={b}
                  onView={() => viewBill(b, `${b.expense.title} · ${money(b.expense.amount, cur)}`)}
                  caption={
                    <button type="button" className="meta" style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => openDrawer('expense', { id: b.expense.id })}>
                      <span className="t truncate">{b.expense.title}</span>
                      <b className="num">{money(b.expense.amount, cur)}</b>
                      <span className="xs muted truncate">
                        {catName(b.expense.category_id)}
                        {b.expense.date ? ` · ${fmtDate(b.expense.date)}` : ''}
                      </span>
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card title="Expenses missing a bill" sub={missing.length ? `${missing.length}` : ''} noBody>
        {missing.length ? (
          <DataTable columns={missingCols} rows={missing} onRowClick={(e) => openDrawer('expense', { id: e.id })} />
        ) : (
          <p className="card-body small">
            <Badge tone="success" icon="check">All good</Badge> Every expense has a bill attached.
          </p>
        )}
      </Card>
    </div>
  );
}
