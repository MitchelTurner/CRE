import type { IndustrialSignalType } from '@prisma/client';

export interface RawRecord {
  sourceRef: string;
  fetchedAt: Date;
  body: unknown;
}

export interface SignalDraft {
  type: IndustrialSignalType;
  subtype?: string;
  companyName: string;
  companyAddress?: string;
  siteAddress?: string;
  occurredAt: Date;
  sourceRef: string;
  headline: string;
  weight: number;
  confidence?: number;
  payload: Record<string, unknown>;
  /** Optional stable company identifiers from source. */
  dotNumber?: string;
  naics?: string;
}

export interface SignalSource {
  readonly key: string;
  readonly cadence: string;
  readonly tier: 1 | 2;

  fetch(since: Date): Promise<RawRecord[]>;
  normalize(raw: RawRecord): SignalDraft[];
}
