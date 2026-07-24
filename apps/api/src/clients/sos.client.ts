/**
 * v2 — SC Secretary of State business entity resolution.
 */
export interface SosEntityResult {
  legalName: string;
  status?: string;
  registeredAgent?: string;
  agentAddress?: string;
  members?: string[];
}

export interface SosClient {
  resolveEntity(name: string): Promise<SosEntityResult | null>;
}

export class StubSosClient implements SosClient {
  async resolveEntity(_name: string): Promise<SosEntityResult | null> {
    return null;
  }
}