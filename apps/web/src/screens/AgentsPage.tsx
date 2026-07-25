import { useEffect, useState } from 'react';
import { listAgents, downloadInviteList } from '../lib/api';
import { useToast } from '../state/toast';

export function AgentsPage() {
  const [items, setItems] = useState<
    Array<{
      name: string;
      address: string | null;
      ownerCount: number;
      parcelCount: number;
      scoreSum: number;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    void listAgents(25)
      .then((r) => setItems(r.items))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load agents'),
      );
  }, []);

  return (
    <div className="animate-fade space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">
            Registered agents
          </h2>
          <p className="text-fog mt-1 max-w-xl text-sm">
            Local attorneys/CPAs who represent the most owner LLCs — referral chokepoints. National
            RA mills are filtered out.
          </p>
        </div>
        <button
          type="button"
          className="bg-moss text-ink hover:bg-moss-dim px-3 py-2 text-sm font-semibold"
          onClick={() =>
            void downloadInviteList({ minScore: 55, excludeContactedWithinDays: 90 }).then(() =>
              push('Invite list CSV downloaded', 'success'),
            )
          }
        >
          Host-mode invite CSV
        </button>
      </div>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <ol className="divide-pine/40 divide-y">
        {items.map((a, i) => (
          <li key={a.name} className="flex items-baseline justify-between gap-4 py-3">
            <div>
              <p className="font-semibold text-white">
                <span className="text-fog mr-2">{i + 1}.</span>
                {a.name}
              </p>
              {a.address ? <p className="text-fog mt-1 text-xs">{a.address}</p> : null}
            </div>
            <p className="text-mist shrink-0 text-sm">
              {a.parcelCount} parcels · {a.ownerCount} owners
            </p>
          </li>
        ))}
      </ol>
      {items.length === 0 ? (
        <p className="text-fog text-sm">No registered-agent contacts yet — run SoS enrichment.</p>
      ) : null}
    </div>
  );
}
