import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  body,
  actionTo,
  actionLabel,
  children,
}: {
  title: string;
  body: string;
  actionTo?: string;
  actionLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-pine/40 bg-ink-2/40 mx-auto max-w-lg border px-6 py-12 text-center">
      <h3 className="font-display text-xl font-bold text-white">{title}</h3>
      <p className="text-fog mt-2 text-sm">{body}</p>
      {actionTo && actionLabel ? (
        <Link
          to={actionTo}
          className="bg-moss text-ink hover:bg-moss-dim mt-5 inline-block px-4 py-2 text-sm font-semibold"
        >
          {actionLabel}
        </Link>
      ) : null}
      {children}
    </div>
  );
}
