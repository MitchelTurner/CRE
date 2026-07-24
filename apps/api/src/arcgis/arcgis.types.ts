export interface ArcGisField {
  name: string;
  type: string;
  alias: string;
  length?: number;
}

export interface ArcGisLayerMetadata {
  name: string;
  maxRecordCount: number;
  advancedQueryCapabilities?: {
    supportsPagination?: boolean;
    supportsDistinct?: boolean;
    supportsOrderBy?: boolean;
  };
  fields: ArcGisField[];
}

export interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: unknown;
}

export interface ArcGisQueryResponse {
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  objectIds?: number[];
  count?: number;
  error?: { code: number; message: string; details?: string[] };
}

export interface ArcGisClientOptions {
  layerUrl: string;
  maxConcurrency?: number;
  pageDelayMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}