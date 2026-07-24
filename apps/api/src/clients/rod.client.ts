/**
 * v2 — Register of Deeds client interface.
 * Implementation behind ROD_SCRAPER_ENABLED kill switch.
 */
export interface RodDeedRecord {
  recordedAt: Date;
  grantor: string;
  grantee: string;
  book?: string;
  page?: string;
  pin?: string;
}

export interface RodMortgageRecord {
  originationDate: Date;
  mortgagor: string;
  mortgagee: string;
  pin?: string;
  amount?: number;
}

export interface RodClient {
  searchRecentDeeds(since: Date): Promise<RodDeedRecord[]>;
  findLatestMortgage(ownerName: string, pin?: string): Promise<RodMortgageRecord | null>;
}

export class DisabledRodClient implements RodClient {
  async searchRecentDeeds(_since: Date): Promise<RodDeedRecord[]> {
    return [];
  }

  async findLatestMortgage(
    _ownerName: string,
    _pin?: string,
  ): Promise<RodMortgageRecord | null> {
    return null;
  }
}