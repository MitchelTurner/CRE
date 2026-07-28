import { Injectable, Logger } from '@nestjs/common';
import type { RawRecord, SignalDraft, SignalSource } from './signal-source.interface';

/** Greenville metro ZIP prefixes (SC). */
const TARGET_ZIP_PREFIXES = ['296', '293', '298']; // Greenville / Spartanburg / Anderson-ish

export type FmcsaCensusRow = {
  dotNumber: string;
  legalName: string;
  phyStreet?: string;
  phyCity?: string;
  phyState?: string;
  phyZip?: string;
  powerUnits?: number;
  drivers?: number;
  cargoCarried?: string;
  mcs150Mileage?: number;
  snapshotMonth: string;
  priorPowerUnits?: number | null;
  isNew?: boolean;
};

@Injectable()
export class FmcsaConnector implements SignalSource {
  readonly key = 'fmcsa';
  readonly cadence = '0 11 1 * *';
  readonly tier = 1 as const;
  private readonly logger = new Logger(FmcsaConnector.name);

  /**
   * Expects FMCSA_FEED_URL → JSON array of census rows already filtered/diffed,
   * or empty when unset (Admin can enqueue after loading snapshots).
   */
  async fetch(_since: Date): Promise<RawRecord[]> {
    const feedUrl = (process.env.FMCSA_FEED_URL || '').trim();
    if (!feedUrl) {
      this.logger.warn('FMCSA_FEED_URL unset — connector idle until census feed configured');
      return [];
    }
    const res = await fetch(feedUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+fmcsa-connector; industrial-signals)',
      },
    });
    if (!res.ok) throw new Error(`FMCSA feed HTTP ${res.status}`);
    const rows = (await res.json()) as FmcsaCensusRow[];
    return rows
      .filter((r) => {
        if ((r.phyState || '').toUpperCase() !== 'SC') return false;
        const zip = (r.phyZip || '').replace(/\D/g, '');
        return TARGET_ZIP_PREFIXES.some((p) => zip.startsWith(p));
      })
      .map((r) => ({
        sourceRef: `${r.dotNumber}:${r.snapshotMonth}`,
        fetchedAt: new Date(),
        body: r,
      }));
  }

  normalize(raw: RawRecord): SignalDraft[] {
    const r = raw.body as FmcsaCensusRow;
    if (!r?.dotNumber || !r.legalName) return [];

    const address = [r.phyStreet, r.phyCity, r.phyState, r.phyZip].filter(Boolean).join(', ');
    const units = Number(r.powerUnits || 0);
    const prior = r.priorPowerUnits == null ? null : Number(r.priorPowerUnits);
    const drafts: SignalDraft[] = [];
    const occurredAt = monthToDate(r.snapshotMonth);

    if (r.isNew || prior == null) {
      const yardEstimate = Math.round(units / 1.4);
      drafts.push({
        type: 'NEW_CARRIER',
        subtype: '',
        companyName: r.legalName,
        companyAddress: address,
        siteAddress: address,
        occurredAt,
        sourceRef: `new:${r.dotNumber}:${r.snapshotMonth}`,
        headline: `New FMCSA carrier — ${r.legalName} (${units} power units; ~${yardEstimate} trailer stalls)`,
        weight: 25,
        dotNumber: r.dotNumber,
        payload: {
          dotNumber: r.dotNumber,
          powerUnits: units,
          drivers: r.drivers ?? null,
          cargoCarried: r.cargoCarried ?? null,
          mcs150Mileage: r.mcs150Mileage ?? null,
          yardStallEstimate: yardEstimate,
          detail: `${units} power units`,
        },
      });
      return drafts;
    }

    if (prior <= 0) return drafts;
    const delta = units - prior;
    const pct = (delta / prior) * 100;

    if (delta >= 3 && pct >= 20) {
      const weight = Math.min(40, 10 + 2 * pct);
      const yardEstimate = Math.round(units / 1.4);
      drafts.push({
        type: 'FLEET_CHANGE',
        subtype: 'growth',
        companyName: r.legalName,
        companyAddress: address,
        siteAddress: address,
        occurredAt,
        sourceRef: `growth:${r.dotNumber}:${r.snapshotMonth}`,
        headline: `Fleet growth — ${r.legalName} ${prior}→${units} units (+${pct.toFixed(0)}%; ~${yardEstimate} stalls)`,
        weight,
        dotNumber: r.dotNumber,
        payload: {
          dotNumber: r.dotNumber,
          powerUnits: units,
          priorPowerUnits: prior,
          pctGrowth: pct,
          yardStallEstimate: yardEstimate,
          detail: `${prior}→${units} power units`,
        },
      });
    } else if (delta < 0 && Math.abs(pct) >= 30) {
      drafts.push({
        type: 'FLEET_CHANGE',
        subtype: 'contraction',
        companyName: r.legalName,
        companyAddress: address,
        siteAddress: address,
        occurredAt,
        sourceRef: `contraction:${r.dotNumber}:${r.snapshotMonth}`,
        headline: `Fleet contraction — ${r.legalName} ${prior}→${units} units (${pct.toFixed(0)}%)`,
        weight: 15,
        dotNumber: r.dotNumber,
        payload: {
          dotNumber: r.dotNumber,
          powerUnits: units,
          priorPowerUnits: prior,
          pctGrowth: pct,
          detail: `${prior}→${units} power units`,
        },
      });
    }

    return drafts;
  }
}

function monthToDate(snapshotMonth: string): Date {
  // YYYY-MM
  const m = snapshotMonth.match(/^(\d{4})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15));
}
