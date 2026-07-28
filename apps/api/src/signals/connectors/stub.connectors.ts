import type { RawRecord, SignalDraft, SignalSource } from './signal-source.interface';

/** Deferred Tier-2 connectors — interface only until feature-flagged. */
class BaseStubConnector implements SignalSource {
  constructor(
    readonly key: string,
    readonly cadence: string,
    readonly tier: 1 | 2 = 2,
  ) {}

  async fetch(_since: Date): Promise<RawRecord[]> {
    if (process.env[`SIGNAL_${this.key.toUpperCase()}_ENABLED`] !== 'true') {
      return [];
    }
    return [];
  }

  normalize(_raw: RawRecord): SignalDraft[] {
    return [];
  }
}

export class ImportsConnector extends BaseStubConnector {
  constructor() {
    super('imports', '0 14 * * 1', 2);
  }
}

export class HiringConnector extends BaseStubConnector {
  constructor() {
    super('hiring', '0 15 * * *', 2);
  }
}
