export type RawEventDraft = {
  name: string;
  startsAt: Date;
  endsAt?: Date | null;
  venue?: string | null;
  city?: string | null;
  hostOrg?: string | null;
  url?: string | null;
  category?: string | null;
  ownerDensity?: 'high' | 'medium' | 'low' | null;
  audience?: string | null;
  people?: Array<{ name: string; company?: string; title?: string; role?: string }>;
  rawPayload: Record<string, unknown>;
};

export interface EventSourceClient {
  readonly sourceId: string;
  fetchUpcoming(from: Date, to: Date): Promise<RawEventDraft[]>;
}
