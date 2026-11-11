import type { ReactNode } from 'react';

export function StatCard({ items }: { items: { icon: ReactNode; value: string; label: string }[] }) {
  return (
    <div className="stat-card">
      {items.map((it, i) => (
        <div className="stat-item" key={i}>
          <span className="stat-ico">{it.icon}</span>
          <strong>{it.value}</strong>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
