'use client';
// Sortable ERP data table. On phones (< 760px) each row becomes a card: the `primary` column is the
// card title and every other cell shows "Label ..... value" (CSS in globals.css, .dt.responsive).
import { useMemo, useState } from 'react';

/**
 * columns: [{ key, label, render?(row), sort?(row) => value, align?: 'r', primary?, hideMobile?, foot? }]
 * foot: a node for the totals row (only when `showFoot`).
 */
export default function DataTable({ columns, rows, rowKey = (r) => r.id, onRowClick, empty = 'Nothing here yet.', defaultSort, showFoot = false, footLabel = 'Total' }) {
  const [sort, setSort] = useState(defaultSort ?? null); // {key, dir: 1|-1}

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const val = col.sort;
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // empties last
      if (y == null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * sort.dir;
    });
  }, [rows, sort, columns]);

  function toggle(col) {
    if (!col.sort) return;
    setSort((s) => (s?.key === col.key ? { key: col.key, dir: -s.dir } : { key: col.key, dir: col.align === 'r' ? -1 : 1 }));
  }

  return (
    <div className="table-wrap">
      <table className="dt responsive">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.align === 'r' ? 'r' : ''} ${c.sort ? 'sortable' : ''}`}
                onClick={() => toggle(c)}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                scope="col"
              >
                {c.label}
                {c.sort && <span className="arrow">{sort?.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr className="empty">
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            sorted.map((r) => (
              <tr
                key={rowKey(r)}
                className={onRowClick ? 'clickable' : ''}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    data-label={c.label}
                    className={`${c.align === 'r' ? 'r num' : ''} ${c.primary ? 'primary-cell' : ''} ${c.hideMobile ? 'hide-mobile' : ''}`}
                  >
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {showFoot && sorted.length > 0 && (
          <tfoot>
            <tr>
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  data-label={c.foot != null ? c.label : ''}
                  className={`${c.align === 'r' ? 'r num' : ''} ${c.foot == null && i !== 0 ? 'blank' : ''}`}
                >
                  {i === 0 && c.foot == null ? footLabel : c.foot}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
