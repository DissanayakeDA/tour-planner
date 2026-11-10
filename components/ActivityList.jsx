'use client';
// Activity log timeline: who (name + phone) did what, when.
import Icon from './Icon';
import { fmtDateTime, timeAgo } from '@/lib/client/format';

const ACTION = {
  create: { icon: 'plus', tone: 'success', label: 'Added' },
  update: { icon: 'edit', tone: 'primary', label: 'Edited' },
  delete: { icon: 'trash', tone: 'danger', label: 'Deleted' },
  upload: { icon: 'upload', tone: 'violet', label: 'Uploaded' },
};

export function ActivityList({ items, showTrip = false }) {
  return (
    <ul className="timeline">
      {items.map((a) => {
        const s = ACTION[a.action] ?? ACTION.update;
        return (
          <li key={a.id}>
            <span className={`dot tone-${s.tone}`} title={s.label}>
              <Icon name={s.icon} />
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="what">{a.summary}</div>
              <div className="who">
                <span>
                  <Icon name="user" size={11} /> <b style={{ color: 'var(--text-2)' }}>{a.actor_name}</b>
                </span>
                <a href={`tel:${a.actor_phone}`} style={{ color: 'inherit' }}>
                  <Icon name="phone" size={11} /> {a.actor_phone}
                </a>
                <span title={fmtDateTime(a.created_at)}>{timeAgo(a.created_at)}</span>
                {showTrip && a.trip_name && <span className="truncate">· {a.trip_name}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
