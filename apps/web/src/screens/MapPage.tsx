import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMapPoints, listParcels } from '../lib/api';
import type { MapPoint, ParcelListItem } from '../lib/types';
import { shortWhyNow } from '../lib/signals';
import { SignalChips } from '../components/SignalChips';
import { ScoreBar } from '../components/ScoreBar';

export function MapPage() {
  const [items, setItems] = useState<MapPoint[]>([]);
  const [list, setList] = useState<ParcelListItem[]>([]);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [bounds, setBounds] = useState({
    minLat: 34.65,
    maxLat: 35.15,
    minLon: -82.65,
    maxLon: -82.15,
  });
  const [minScore, setMinScore] = useState(40);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listMapPoints({ minScore, limit: 400 }),
      listParcels({ minScore, limit: 40 }),
    ])
      .then(([mapRes, listRes]) => {
        if (cancelled) return;
        setItems(mapRes.items);
        setBounds(mapRes.bounds);
        setList(listRes.items);
        if (!selectedPin && listRes.items[0]) setSelectedPin(listRes.items[0].pin);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Map load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [minScore]);

  const selected = useMemo(
    () => list.find((i) => i.pin === selectedPin) ?? null,
    [list, selectedPin],
  );

  return (
    <div className="animate-fade">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">Map</h2>
          <p className="text-fog mt-1 max-w-xl text-sm">
            Click a pin to highlight the list row. Same score filter drives both panes.
          </p>
        </div>
        <label className="text-fog text-sm">
          Min score{' '}
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value) || 0)}
            className="border-pine-soft bg-ink/40 ml-2 w-20 border px-2 py-1 text-white"
          />
        </label>
      </div>

      {error ? <p className="text-danger mb-4 text-sm">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="border-pine/40 relative aspect-[16/10] w-full overflow-hidden border bg-[radial-gradient(ellipse_at_30%_20%,#1a3a2f,transparent_50%),linear-gradient(160deg,#0c1612,#14241c_55%,#0e1a14)]">
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:48px_48px]" />
          {items.map((p) => {
            const x = ((p.longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 100;
            const y = ((bounds.maxLat - p.latitude) / (bounds.maxLat - bounds.minLat)) * 100;
            const score = p.score ?? 0;
            const size = 6 + Math.min(14, score / 8);
            const active = selectedPin === p.pin;
            return (
              <button
                key={p.id}
                type="button"
                title={`${p.situsAddress || p.pin} · ${score}`}
                onClick={() => setSelectedPin(p.pin)}
                className={[
                  'absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition',
                  active ? 'bg-brass ring-2 ring-white/70' : 'bg-moss hover:bg-brass',
                ].join(' ')}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: size,
                  height: size,
                  opacity: active ? 1 : 0.35 + Math.min(0.65, score / 100),
                }}
              />
            );
          })}
          {loading ? (
            <p className="text-fog absolute inset-0 flex items-center justify-center text-sm">
              Loading…
            </p>
          ) : null}
        </div>

        <div className="border-pine/40 max-h-[70vh] overflow-y-auto border">
          <ul className="divide-pine/40 divide-y">
            {list.map((row) => {
              const active = row.pin === selectedPin;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPin(row.pin)}
                    className={[
                      'w-full px-4 py-3 text-left transition',
                      active ? 'bg-moss/10' : 'hover:bg-white/3',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {row.situsAddress || row.pin}
                        </p>
                        <p className="text-fog mt-1 text-xs">
                          {shortWhyNow(row.whyNow, 90) || row.ownerName || '—'}
                        </p>
                        <SignalChips types={row.signalTypes} max={3} />
                      </div>
                      <ScoreBar score={row.score} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected ? (
            <div className="border-pine/40 sticky bottom-0 border-t bg-ink/95 p-3">
              <Link
                to={`/parcels/${encodeURIComponent(selected.pin)}`}
                className="bg-moss text-ink hover:bg-moss-dim inline-block px-3 py-2 text-sm font-semibold"
              >
                Open parcel
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
