import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMapPoints, listParcels } from '../lib/api';
import type { MapPoint, ParcelListItem } from '../lib/types';
import { shortWhyNow } from '../lib/signals';
import { SignalChips } from '../components/SignalChips';
import { ScoreBar } from '../components/ScoreBar';
import { ParcelMap } from '../components/ParcelMap';

export function MapPage() {
  const [items, setItems] = useState<MapPoint[]>([]);
  const [list, setList] = useState<ParcelListItem[]>([]);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0);
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
        setList(listRes.items);
        setSelectedPin((prev) => {
          if (prev && (mapRes.items.some((i) => i.pin === prev) || listRes.items.some((i) => i.pin === prev))) {
            return prev;
          }
          return mapRes.items[0]?.pin ?? listRes.items[0]?.pin ?? null;
        });
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

  const onSelect = useCallback((pin: string) => {
    setSelectedPin(pin);
  }, []);

  const selected = useMemo(() => {
    return (
      list.find((i) => i.pin === selectedPin) ??
      items.find((i) => i.pin === selectedPin) ??
      null
    );
  }, [list, items, selectedPin]);

  return (
    <div className="animate-fade">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">Map</h2>
          <p className="text-fog mt-1 max-w-xl text-sm">
            Greenville commercial pins — click the map or list to sync selection.
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
        <div className="relative">
          <ParcelMap items={items} selectedPin={selectedPin} onSelect={onSelect} />
          {loading ? (
            <p className="text-fog absolute inset-0 z-[500] flex items-center justify-center bg-ink/50 text-sm">
              Loading…
            </p>
          ) : null}
          {!loading && items.length === 0 ? (
            <div className="border-pine/50 bg-ink/90 absolute inset-x-4 bottom-4 z-[500] border p-4 text-sm">
              <p className="font-semibold text-white">No map pins yet</p>
              <p className="text-fog mt-1">
                Pins need coordinates from a full sync. If inventory was wiped, restore inactive
                parcels in Admin, then re-sync.
              </p>
              <Link to="/admin" className="text-moss mt-2 inline-block font-semibold">
                Open Admin
              </Link>
            </div>
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
          {!loading && list.length === 0 ? (
            <p className="text-fog p-4 text-sm">No parcels match this score filter.</p>
          ) : null}
          {selected && 'id' in selected ? (
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
