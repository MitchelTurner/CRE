import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createDriveBy,
  listDriveBys,
  nearestDriveByParcel,
} from '../lib/api';
import { announceAward } from '../lib/awards';
import { formatDate } from '../lib/format';
import { useToast } from '../state/toast';

const TAG_OPTS = [
  { id: 'vacancy', label: 'Vacancy' },
  { id: 'for_lease', label: 'For lease sign' },
  { id: 'deferred_maint', label: 'Deferred maint.' },
  { id: 'other', label: 'Other' },
];

type CaptureRow = Awaited<ReturnType<typeof listDriveBys>>['items'][number];

export function DriveByPage() {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [nearest, setNearest] = useState<{
    pin: string;
    situsAddress: string | null;
    distanceM: number;
  } | null>(null);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('image/jpeg');
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<CaptureRow[]>([]);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function reload() {
    const res = await listDriveBys(40);
    setItems(res.items);
  }

  useEffect(() => {
    void reload().catch(() => undefined);
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function locate() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Geolocation not available on this device');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const ln = pos.coords.longitude;
        setLat(la);
        setLng(ln);
        void nearestDriveByParcel(la, ln)
          .then((r) => setNearest(r.nearest))
          .catch(() => setNearest(null));
      },
      (err) => setGeoError(err.message || 'Could not get GPS'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  function onFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      push('Choose a photo', 'danger');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setPreview(dataUrl);
      setMediaType(file.type || 'image/jpeg');
      setImageBase64(dataUrl.replace(/^data:[^;]+;base64,/, ''));
    };
    reader.readAsDataURL(file);
  }

  function toggleTag(id: string) {
    setTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  return (
    <div className="animate-fade relative z-[1] flex flex-col gap-8">
      <div>
        <p className="text-moss text-xs font-semibold tracking-[0.22em] uppercase">Field</p>
        <h2 className="font-display mt-2 text-4xl font-bold tracking-tight text-white">
          Drive-by
        </h2>
        <p className="text-fog mt-2 max-w-xl text-sm">
          Capture vacancy, for-lease signs, and notes at a parcel. GPS matches the nearest commercial
          PIN. +25 XP each.
        </p>
      </div>

      <section className="event-card flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-fog text-xs tracking-[0.16em] uppercase">Location</p>
            <p className="mt-1 text-sm text-white">
              {lat != null && lng != null
                ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                : 'Waiting for GPS…'}
            </p>
            {nearest ? (
              <p className="text-moss mt-1 text-sm">
                Nearest: {nearest.situsAddress || nearest.pin} · {Math.round(nearest.distanceM)}m
              </p>
            ) : (
              <p className="text-fog mt-1 text-xs">No commercial parcel within ~250m</p>
            )}
            {geoError ? <p className="text-danger mt-1 text-xs">{geoError}</p> : null}
          </div>
          <button type="button" className="btn-ghost" onClick={locate}>
            Refresh GPS
          </button>
        </div>

        <div>
          <p className="text-fog mb-2 text-xs tracking-[0.16em] uppercase">Tags</p>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tags.includes(t.id) ? 'chip-active' : 'chip'}
                onClick={() => toggleTag(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          className="field w-full"
          rows={3}
          placeholder="What did you see? Access, vacancy, seller vibe…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div>
          <label className="btn-ghost inline-flex cursor-pointer">
            Take / upload photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {preview ? (
            <img
              src={preview}
              alt="Capture preview"
              className="border-pine/40 mt-3 max-h-48 rounded-xl border object-cover"
            />
          ) : null}
        </div>

        <button
          type="button"
          className="btn-primary disabled:opacity-50"
          disabled={busy || lat == null || lng == null}
          onClick={() => {
            if (lat == null || lng == null) return;
            setBusy(true);
            void createDriveBy({
              latitude: lat,
              longitude: lng,
              note: note || undefined,
              tags,
              imageBase64: imageBase64 || undefined,
              mediaType,
              pin: nearest?.pin,
            })
              .then((r) => {
                announceAward(
                  push,
                  r.award,
                  r.pin ? `Saved near ${r.pin}` : 'Saved (no parcel match)',
                );
                setNote('');
                setTags([]);
                setImageBase64(null);
                setPreview(null);
                return reload();
              })
              .catch((err: unknown) =>
                push(err instanceof Error ? err.message : 'Save failed', 'danger'),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Saving…' : 'Log drive-by (+25 XP)'}
        </button>
      </section>

      <section>
        <h3 className="font-display text-xl font-bold text-white">Recent captures</h3>
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((c) => (
            <li key={c.id} className="event-card">
              <p className="text-brass text-[10px] font-semibold tracking-[0.16em] uppercase">
                {c.tags.join(' · ') || 'drive-by'}
                {c.hasImage ? ' · photo' : ''}
              </p>
              {c.parcel ? (
                <Link
                  to={`/parcels/${encodeURIComponent(c.parcel.pin)}`}
                  className="font-display mt-1 block text-lg font-bold text-white hover:text-moss"
                >
                  {c.parcel.situsAddress || c.parcel.pin}
                </Link>
              ) : (
                <p className="font-display mt-1 text-lg font-bold text-white">No PIN match</p>
              )}
              {c.note ? <p className="text-mist mt-2 text-sm">{c.note}</p> : null}
              <p className="text-fog mt-2 text-xs">
                {formatDate(c.createdAt)}
                {c.distanceM != null ? ` · ${Math.round(c.distanceM)}m` : ''}
              </p>
            </li>
          ))}
          {items.length === 0 ? (
            <li className="text-fog text-sm">No drive-bys yet — log one above.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
