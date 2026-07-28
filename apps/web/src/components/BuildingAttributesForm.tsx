import { useEffect, useState } from 'react';
import {
  getBuildingAttributes,
  saveBuildingAttributes,
  type BuildingAttributesPayload,
} from '../lib/api';
import { useToast } from '../state/toast';

const empty: BuildingAttributesPayload = {
  buildingSf: null,
  clearHeightFt: null,
  dockDoors: null,
  driveInDoors: null,
  sprinklerType: '',
  powerAmps: null,
  powerVolts: null,
  railServed: false,
  yardAcres: null,
  trailerStalls: null,
  officeSf: null,
  craneCapacityTon: null,
  yearBuilt: null,
  isListed: false,
  sourceNotes: '',
};

type Props = { pin: string };

/** Fast keyboard-driven industrial building capture (~20s per parcel). */
export function BuildingAttributesForm({ pin }: Props) {
  const { push } = useToast();
  const [form, setForm] = useState<BuildingAttributesPayload>(empty);
  const [inferred, setInferred] = useState<{ buildingSf: number | null; yearBuilt: number | null }>({
    buildingSf: null,
    yearBuilt: null,
  });
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getBuildingAttributes(pin)
      .then((data) => {
        if (cancelled) return;
        const a = data.attributes;
        setInferred(data.inferred);
        setVerifiedAt(a?.verifiedAt ?? null);
        setForm({
          buildingSf: a?.buildingSf ?? data.inferred.buildingSf,
          clearHeightFt: a?.clearHeightFt ?? null,
          dockDoors: a?.dockDoors ?? null,
          driveInDoors: a?.driveInDoors ?? null,
          sprinklerType: a?.sprinklerType ?? '',
          powerAmps: a?.powerAmps ?? null,
          powerVolts: a?.powerVolts ?? null,
          railServed: a?.railServed ?? false,
          yardAcres: a?.yardAcres ?? null,
          trailerStalls: a?.trailerStalls ?? null,
          officeSf: a?.officeSf ?? null,
          craneCapacityTon: a?.craneCapacityTon ?? null,
          yearBuilt: a?.yearBuilt ?? data.inferred.yearBuilt,
          isListed: a?.isListed ?? false,
          sourceNotes: a?.sourceNotes ?? '',
        });
      })
      .catch(() => {
        /* parcel may lack industrial attrs yet */
      });
    return () => {
      cancelled = true;
    };
  }, [pin]);

  function setNum(key: keyof BuildingAttributesPayload, raw: string) {
    const v = raw.trim() === '' ? null : Number(raw);
    setForm((f) => ({ ...f, [key]: v != null && Number.isFinite(v) ? v : null }));
  }

  async function save() {
    setBusy(true);
    try {
      const result = await saveBuildingAttributes(pin, {
        ...form,
        sprinklerType: form.sprinklerType || null,
        markVerified: true,
        verifiedBy: 'agent',
      });
      setVerifiedAt(new Date().toISOString());
      push(
        `Building attrs saved${result.attributes.clearHeightFt != null ? ` · ${result.attributes.clearHeightFt}' clear` : ''}`,
        'success',
      );
    } catch (err) {
      push(err instanceof Error ? err.message : 'Save failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  const sfInferred = inferred.buildingSf != null && form.buildingSf === inferred.buildingSf && !verifiedAt;
  const yearInferred = inferred.yearBuilt != null && form.yearBuilt === inferred.yearBuilt && !verifiedAt;

  return (
    <div className="border-pine/50 mt-10 border-t pt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-bold text-white">Building attributes</h3>
          <p className="text-fog mt-1 text-xs">
            Industrial moat data — Tab through fields, Enter to save. Inferred assessor values shown in
            amber until verified.
          </p>
        </div>
        {verifiedAt ? (
          <span className="text-moss text-xs">Verified {new Date(verifiedAt).toLocaleDateString()}</span>
        ) : (
          <span className="text-xs text-amber-400/90">Unverified</span>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Building SF"
          inferred={sfInferred}
          value={form.buildingSf ?? ''}
          onChange={(v) => setNum('buildingSf', v)}
        />
        <Field
          label="Clear height (ft)"
          value={form.clearHeightFt ?? ''}
          onChange={(v) => setNum('clearHeightFt', v)}
        />
        <Field label="Dock doors" value={form.dockDoors ?? ''} onChange={(v) => setNum('dockDoors', v)} />
        <Field
          label="Drive-in doors"
          value={form.driveInDoors ?? ''}
          onChange={(v) => setNum('driveInDoors', v)}
        />
        <label className="text-xs">
          <span className="text-fog">Sprinkler</span>
          <select
            className="border-pine-soft bg-ink text-mist mt-1 w-full rounded border px-3 py-2 text-sm"
            value={form.sprinklerType ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, sprinklerType: e.target.value }))}
          >
            <option value="">—</option>
            <option value="ESFR">ESFR</option>
            <option value="wet">wet</option>
            <option value="dry">dry</option>
            <option value="none">none</option>
          </select>
        </label>
        <Field label="Power amps" value={form.powerAmps ?? ''} onChange={(v) => setNum('powerAmps', v)} />
        <Field label="Power volts" value={form.powerVolts ?? ''} onChange={(v) => setNum('powerVolts', v)} />
        <Field label="Yard acres" value={form.yardAcres ?? ''} onChange={(v) => setNum('yardAcres', v)} />
        <Field
          label="Trailer stalls"
          value={form.trailerStalls ?? ''}
          onChange={(v) => setNum('trailerStalls', v)}
        />
        <Field label="Office SF" value={form.officeSf ?? ''} onChange={(v) => setNum('officeSf', v)} />
        <Field
          label="Crane (tons)"
          value={form.craneCapacityTon ?? ''}
          onChange={(v) => setNum('craneCapacityTon', v)}
        />
        <Field
          label="Year built"
          inferred={yearInferred}
          value={form.yearBuilt ?? ''}
          onChange={(v) => setNum('yearBuilt', v)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="text-mist flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={Boolean(form.railServed)}
            onChange={(e) => setForm((f) => ({ ...f, railServed: e.target.checked }))}
          />
          Rail served
        </label>
        <label className="text-mist flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={Boolean(form.isListed)}
            onChange={(e) => setForm((f) => ({ ...f, isListed: e.target.checked }))}
          />
          Currently listed
        </label>
      </div>

      <input
        className="border-pine-soft bg-ink text-mist mt-3 w-full rounded border px-3 py-2 text-sm"
        placeholder="Source notes (tour, OM, drive-by…)"
        value={form.sourceNotes ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, sourceNotes: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
        }}
      />

      <button
        type="button"
        disabled={busy}
        className="btn-primary mt-3 !text-xs disabled:opacity-50"
        onClick={() => void save()}
      >
        {busy ? 'Saving…' : 'Save building attrs'}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inferred,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  inferred?: boolean;
}) {
  return (
    <label className="text-xs">
      <span className={inferred ? 'text-amber-400/90' : 'text-fog'}>
        {label}
        {inferred ? ' · inferred' : ''}
      </span>
      <input
        type="number"
        step="any"
        className={[
          'border-pine-soft bg-ink mt-1 w-full rounded border px-3 py-2 text-sm',
          inferred ? 'text-amber-200' : 'text-mist',
        ].join(' ')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
