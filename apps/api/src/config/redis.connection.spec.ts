import { buildRedisConnection, resolveRedisUrl } from './redis.connection';

describe('buildRedisConnection', () => {
  it('parses redis:// into host/port/password (not a url field)', () => {
    const opts = buildRedisConnection('redis://default:s3cret@redis.railway.internal:6379');
    expect(opts).toMatchObject({
      host: 'redis.railway.internal',
      port: 6379,
      username: 'default',
      password: 's3cret',
      maxRetriesPerRequest: null,
      family: 0,
    });
    expect(opts).not.toHaveProperty('url');
    expect(opts.tls).toBeUndefined();
  });

  it('enables tls for rediss://', () => {
    const opts = buildRedisConnection('rediss://:pw@host.proxy.rlwy.net:12345');
    expect(opts.host).toBe('host.proxy.rlwy.net');
    expect(opts.port).toBe(12345);
    expect(opts.password).toBe('pw');
    expect(opts.tls).toEqual({});
  });

  it('rejects garbage', () => {
    expect(() => buildRedisConnection('not-a-url')).toThrow(/Invalid REDIS_URL/);
  });
});

describe('resolveRedisUrl', () => {
  it('prefers REDIS_URL', () => {
    expect(resolveRedisUrl({ REDIS_URL: 'redis://a:1', REDIS_PRIVATE_URL: 'redis://b:2' })).toBe(
      'redis://a:1',
    );
  });

  it('builds from REDISHOST parts', () => {
    expect(
      resolveRedisUrl({
        REDISHOST: 'redis.railway.internal',
        REDISPORT: '6379',
        REDISUSER: 'default',
        REDISPASSWORD: 'x',
      }),
    ).toBe('redis://default:x@redis.railway.internal:6379');
  });
});