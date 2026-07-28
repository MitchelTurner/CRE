import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createRequirement,
  generateIndustrialQuarterlyReport,
  getRequirementMatches,
  listRequirements,
} from '../lib/api';
import { getToken } from '../lib/auth';
import { useToast } from '../state/toast';

export function RequirementsPage() {
  const { push } = useToast();
  const [reqs, setReqs] = useState<
    Array<{
      id: string;
      clientName: string;
      minSf: number | null;
      maxSf: number | null;
      minClearHeight: number | null;
      minDockDoors: number | null;
      minYardAcres: number | null;
      railRequired: boolean;
      submarkets: string[];
      notes: string | null;
    }>
  >([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<
    Array<{
      pin: string;
      situsAddress: string | null;
      ownerName: string | null;
      isListed: boolean;
      score: number;
      matchExplanation: string;
    }>
  >([]);
  const [form, setForm] = useState({
    clientName: '',
    minSf: '',
    maxSf: '',
    minClearHeight: '',
    minDockDoors: '',
    minYardAcres: '',
    railRequired: false,
    submarkets: '',
    notes: '',
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setReqs(await listRequirements(true));
  }

  useEffect(() => {
    void refresh().catch((err: unknown) =>
      push(err instanceof Error ? err.message : 'Failed to load requirements', 'danger'),
    );
  }, [push]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      const result = await fn();
      const note =
        result && typeof result === 'object' && 'note' in result
          ? String((result as { note?: string }).note)
          : `${label} done`;
      push(note || `${label} done`, 'success');
      await refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : `${label} failed`, 'danger');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="animate-fade space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">Requirements</h2>
        <p className="text-fog mt-1 max-w-2xl text-sm">
          Reverse canvass — match live client needs to verified BuildingAttributes. Off-market ranks
          above listed.
        </p>
      </div>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">New requirement</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm md:col-span-2"
            placeholder="Client name"
            value={form.clientName}
            onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Min SF"
            value={form.minSf}
            onChange={(e) => setForm((f) => ({ ...f, minSf: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Max SF"
            value={form.maxSf}
            onChange={(e) => setForm((f) => ({ ...f, maxSf: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Min clear height (ft)"
            value={form.minClearHeight}
            onChange={(e) => setForm((f) => ({ ...f, minClearHeight: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Min dock doors"
            value={form.minDockDoors}
            onChange={(e) => setForm((f) => ({ ...f, minDockDoors: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Min yard acres"
            value={form.minYardAcres}
            onChange={(e) => setForm((f) => ({ ...f, minYardAcres: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Submarkets (comma-separated)"
            value={form.submarkets}
            onChange={(e) => setForm((f) => ({ ...f, submarkets: e.target.value }))}
          />
          <label className="text-mist flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.railRequired}
              onChange={(e) => setForm((f) => ({ ...f, railRequired: e.target.checked }))}
            />
            Rail required
          </label>
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm md:col-span-2"
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <button
          type="button"
          disabled={!!busy || !form.clientName.trim()}
          className="btn-primary mt-3 !text-xs disabled:opacity-50"
          onClick={() =>
            void run('Create requirement', async () => {
              const created = await createRequirement({
                clientName: form.clientName.trim(),
                minSf: numOrNull(form.minSf),
                maxSf: numOrNull(form.maxSf),
                minClearHeight: numOrNull(form.minClearHeight),
                minDockDoors: numOrNull(form.minDockDoors),
                minYardAcres: numOrNull(form.minYardAcres),
                railRequired: form.railRequired,
                submarkets: form.submarkets
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                notes: form.notes || null,
              });
              setForm({
                clientName: '',
                minSf: '',
                maxSf: '',
                minClearHeight: '',
                minDockDoors: '',
                minYardAcres: '',
                railRequired: false,
                submarkets: '',
                notes: '',
              });
              setSelected(created.id);
              const m = await getRequirementMatches(created.id);
              setMatches(m.matches);
              return { note: `Requirement created · ${m.matches.length} matches` };
            })
          }
        >
          Save & match
        </button>
      </section>

      <section className="event-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Active requirements</h3>
          <button
            type="button"
            disabled={!!busy}
            className="btn-ghost !text-xs disabled:opacity-50"
            onClick={() =>
              void run('Industrial report', async () => {
                const r = await generateIndustrialQuarterlyReport(false);
                return {
                  note: `${r.title} · ${r.verifiedCount} verified · coverage ${r.coverage.pct}%`,
                };
              })
            }
          >
            Generate industrial snapshot
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {reqs.length === 0 ? (
            <p className="text-fog text-xs">No requirements yet.</p>
          ) : (
            reqs.map((r) => (
              <button
                key={r.id}
                type="button"
                className={[
                  'border-pine-soft w-full rounded border px-3 py-2 text-left text-sm',
                  selected === r.id ? 'bg-pine/30 text-white' : 'text-mist hover:bg-pine/10',
                ].join(' ')}
                onClick={() =>
                  void run(`Match ${r.clientName}`, async () => {
                    setSelected(r.id);
                    const m = await getRequirementMatches(r.id);
                    setMatches(m.matches);
                    return { note: `${m.matches.length} canvass matches` };
                  })
                }
              >
                <span className="font-semibold">{r.clientName}</span>
                <span className="text-fog ml-2 text-xs">
                  {[
                    r.minSf != null ? `≥${r.minSf.toLocaleString()} SF` : null,
                    r.minClearHeight != null ? `${r.minClearHeight}'+` : null,
                    r.railRequired ? 'rail' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'open brief'}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="event-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Canvass list</h3>
          {selected ? (
            <a
              className="text-moss text-xs font-semibold"
              href={`/requirements/${encodeURIComponent(selected)}/matches.csv`}
              onClick={(e) => {
                // Use API token via fetch download would be better; open path with auth header isn't trivial.
                e.preventDefault();
                const token = getToken();
                void fetch(`/requirements/${encodeURIComponent(selected)}/matches.csv`, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
                  .then(async (res) => {
                    if (!res.ok) throw new Error(`CSV ${res.status}`);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `canvass-${selected}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    push('CSV downloaded', 'success');
                  })
                  .catch((err: unknown) =>
                    push(err instanceof Error ? err.message : 'CSV failed', 'danger'),
                  );
              }}
            >
              Export CSV
            </a>
          ) : null}
        </div>
        <div className="mt-3 space-y-3">
          {matches.length === 0 ? (
            <p className="text-fog text-xs">
              Select a requirement to rank buildings. Capture clear height on parcel pages first.
            </p>
          ) : (
            matches.map((m) => (
              <div key={m.pin} className="border-pine-soft border-b pb-2 last:border-0">
                <p className="text-sm font-semibold text-white">
                  <Link className="hover:text-moss" to={`/parcels/${encodeURIComponent(m.pin)}`}>
                    {m.situsAddress || m.pin}
                  </Link>{' '}
                  <span className="text-fog font-normal">
                    · {m.isListed ? 'listed' : 'off-market'} · {m.score.toFixed(0)}
                  </span>
                </p>
                <p className="text-fog text-xs">{m.ownerName || 'Owner unknown'}</p>
                <p className="text-mist mt-1 text-xs">{m.matchExplanation}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function numOrNull(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
