import { cleanEnvSecret, parseEnvFlag, resolveLlmEnabled } from './env-flags';

describe('env-flags', () => {
  it('parses common truthy/falsey forms', () => {
    expect(parseEnvFlag('true')).toBe(true);
    expect(parseEnvFlag('True')).toBe(true);
    expect(parseEnvFlag('"true"')).toBe(true);
    expect(parseEnvFlag('1')).toBe(true);
    expect(parseEnvFlag('yes')).toBe(true);
    expect(parseEnvFlag('false')).toBe(false);
    expect(parseEnvFlag('FALSE')).toBe(false);
    expect(parseEnvFlag('0')).toBe(false);
    expect(parseEnvFlag('')).toBeNull();
    expect(parseEnvFlag(undefined)).toBeNull();
  });

  it('strips quotes from secrets', () => {
    expect(cleanEnvSecret('"sk-ant-abc"')).toBe('sk-ant-abc');
    expect(cleanEnvSecret("  sk-ant-abc  ")).toBe('sk-ant-abc');
  });

  it('auto-enables when key present and flag unset', () => {
    const r = resolveLlmEnabled({ ANTHROPIC_API_KEY: 'sk-ant-long-enough-key' });
    expect(r.enabled).toBe(true);
    expect(r.keyPresent).toBe(true);
  });

  it('respects explicit false even with key', () => {
    const r = resolveLlmEnabled({
      LLM_ENABLED: 'false',
      ANTHROPIC_API_KEY: 'sk-ant-long-enough-key',
    });
    expect(r.enabled).toBe(false);
  });

  it('accepts True / 1 for LLM_ENABLED', () => {
    expect(
      resolveLlmEnabled({
        LLM_ENABLED: 'True',
        ANTHROPIC_API_KEY: 'sk-ant-long-enough-key',
      }).enabled,
    ).toBe(true);
    expect(
      resolveLlmEnabled({
        LLM_ENABLED: '1',
        ANTHROPIC_API_KEY: 'sk-ant-long-enough-key',
      }).enabled,
    ).toBe(true);
  });
});
