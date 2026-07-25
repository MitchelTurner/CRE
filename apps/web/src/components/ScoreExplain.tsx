import type { ScoreComponents } from '../lib/types';
import { ScoreBar } from './ScoreBar';

const LABELS: Array<[keyof ScoreComponents | string, string]> = [
  ['holdPeriod', 'Hold period'],
  ['absentee', 'Absentee'],
  ['entity', 'Entity'],
  ['multiParcel', 'Multi-parcel'],
  ['landUsePriority', 'Land use'],
  ['taxDelinquent', 'Tax delinquent'],
  ['taxSeverity', 'Tax severity'],
  ['mortgageMaturity', 'Mortgage maturity'],
  ['loanPressure', 'Loan pressure'],
  ['foreclosure', 'Foreclosure'],
  ['recentSeller', 'Recent seller / comp'],
  ['sosBoost', 'SoS'],
  ['fmvBoost', 'FMV'],
  ['oosDecay', 'OOS decay'],
  ['portfolioCluster', 'Portfolio'],
  ['zoningWatch', 'Zoning'],
  ['permitActivity', 'Permits'],
  ['nearbyListing', 'Nearby listing'],
  ['vacancyProxy', 'Vacancy'],
  ['judgmentLien', 'Judgment lien'],
  ['probateEstate', 'Probate'],
  ['floodRisk', 'Flood'],
  ['submarketFit', 'Submarket'],
];

export function ScoreExplain({
  score,
  components,
  open,
  onClose,
}: {
  score: number | null;
  components: ScoreComponents | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 md:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="border-pine/50 bg-ink relative z-10 w-full max-w-md border p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <ScoreBar score={score} large />
          <button type="button" className="text-fog hover:text-mist text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        {components ? (
          <ul className="space-y-1.5 text-sm">
            {LABELS.map(([key, label]) => {
              const pts = Number((components as unknown as Record<string, unknown>)[key] ?? 0);
              if (!pts) return null;
              return (
                <li key={key} className="flex justify-between border-b border-white/5 py-1.5">
                  <span className="text-fog">{label}</span>
                  <span className="font-semibold text-white">+{pts}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-fog text-sm">No component breakdown yet.</p>
        )}
      </div>
    </div>
  );
}
