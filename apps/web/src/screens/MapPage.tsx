import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMapPoints } from '../lib/api';
import type { MapPoint } from '../lib/types';

export function MapPage() {
  const [items, setItems] = useState<MapPoint[]>([]);
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
    listMapPoints({ minScore, limit: 400 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setBounds(res.bounds);
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

  return (
    <div className="animate-fade">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">Map</h2>
          <p className="text-fog mt-1 max-w-xl text-sm">
            Score heat across Greenville commercial parcels. Work a submarket in one drive.
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
      {loading ? <p className="text-fog text-sm">Loading map…</p> : null}

      <div className="border-pine/40 relative aspect-[16/10] w-full overflow-hidden border bg-[radial-gradient(ellipse_at_30%_20%,#1a3a2f,transparent_50%),linear-gradient(160deg,#0c1612,#14241c_55%,#0e1a14)]">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:48px_48px]" />
        {items.map((p) => {
          const x = ((p.longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 100;
          const y = ((bounds.maxLat - p.latitude) / (bounds.maxLat - bounds.minLat)) * 100;
          const score = p.score ?? 0;
          const size = 6 + Math.min(14, score / 8);
          const opacity = 0.35 + Math.min(0.65, score / 100);
          return (
            <Link
              key={p.id}
              to={`/parcels/${encodeURIComponent(p.pin)}`}
              title={`${p.situsAddress || p.pin} · ${score}`}
              className="bg-moss hover:bg-brass absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                opacity,
              }}
            />
          );
        })}
        {!loading && items.length === 0 ? (
          <p className="text-fog absolute inset-0 flex items-center justify-center text-sm">
            No geocoded parcels yet — run a sync to capture centroids.
          </p>
        ) : null}
      </div>
      <p className="text-fog mt-3 text-xs">{items.length} pins · click a point for parcel detail</p>
    </div>
  );
}
