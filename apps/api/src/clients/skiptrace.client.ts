/**
 * v2 — Skip tracing behind SKIPTRACE_WEEKLY_CAP budget.
 */
export interface SkipTraceResult {
  name?: string;
  phone?: string;
  email?: string;
  raw?: unknown;
}

export interface SkipTraceClient {
  lookup(input: {
    name: string;
    mailingAddress?: string | null;
  }): Promise<SkipTraceResult | null>;
}

export class StubSkipTraceClient implements SkipTraceClient {
  async lookup(_input: {
    name: string;
    mailingAddress?: string | null;
  }): Promise<SkipTraceResult | null> {
    return null;
  }
}