export type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  family: number;
};

/**
 * Build ioredis options for BullMQ.
 *
 * Important: ioredis does NOT honor `{ url: 'redis://...' }` as an options field —
 * that silently falls back to localhost:6379. Always parse into host/port/password.
 *
 * Railway private networking is IPv6 — `family: 0` enables dual-stack DNS.
 */
export function buildRedisConnection(redisUrl: string): RedisConnectionOptions {
  if (!redisUrl) {
    throw new Error('REDIS_URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error(`Invalid REDIS_URL: ${redisUrl}`);
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(`Unsupported Redis protocol: ${parsed.protocol}`);
  }

  const port = parsed.port ? Number(parsed.port) : 6379;
  const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
  const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;

  const options: RedisConnectionOptions = {
    host: parsed.hostname,
    port,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Railway private network is IPv6-only; 0 = dual-stack.
    family: 0,
  };

  if (username) options.username = username;
  if (password) options.password = password;
  // Public Railway Redis often uses rediss://; private usually redis:// without TLS.
  if (parsed.protocol === 'rediss:') {
    options.tls = {};
  }

  return options;
}

/** Resolve Redis URL from common Railway / local env vars. */
export function resolveRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
  const fromUrl =
    env.REDIS_URL ||
    env.REDIS_PRIVATE_URL ||
    env.redis_url ||
    '';

  if (fromUrl) return fromUrl;

  // Discrete vars some Railway templates inject
  const host = env.REDISHOST || env.REDIS_HOST;
  const port = env.REDISPORT || env.REDIS_PORT || '6379';
  const user = env.REDISUSER || env.REDIS_USER || 'default';
  const password = env.REDISPASSWORD || env.REDIS_PASSWORD || '';

  if (host) {
    const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : '';
    return `redis://${auth}${host}:${port}`;
  }

  return 'redis://localhost:6379';
}