/**
 * BullMQ requires maxRetriesPerRequest: null on the shared Redis connection.
 * Railway private networking often needs family: 0 (dual-stack).
 */
export function buildRedisConnection(redisUrl: string): {
  url: string;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  family: number;
} {
  if (!redisUrl) {
    throw new Error('REDIS_URL is required');
  }

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Prefer dual-stack DNS — Railway internal Redis often resolves to IPv6.
    family: 0,
  };
}