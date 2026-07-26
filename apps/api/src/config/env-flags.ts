/** Parse common truthy/falsey Railway / dotenv values. */
export function parseEnvFlag(raw: string | undefined | null): boolean | null {
  if (raw == null) return null;
  const v = String(raw).trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (!v) return null;
  if (['true', '1', 'yes', 'on', 'y'].includes(v)) return true;
  if (['false', '0', 'no', 'off', 'n'].includes(v)) return false;
  return null;
}

export function cleanEnvSecret(raw: string | undefined | null): string {
  if (!raw) return '';
  return String(raw).trim().replace(/^['"]|['"]$/g, '');
}

/**
 * LLM is on when:
 * - LLM_ENABLED is truthy, or
 * - LLM_ENABLED unset and ANTHROPIC_API_KEY is present
 * Explicit LLM_ENABLED=false always wins.
 */
export function resolveLlmEnabled(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  reason: string;
  keyPresent: boolean;
  rawFlag: string;
} {
  const rawFlag = env.LLM_ENABLED ?? '';
  const flag = parseEnvFlag(rawFlag);
  const key = cleanEnvSecret(env.ANTHROPIC_API_KEY);
  const keyPresent = key.length > 8;

  if (flag === false) {
    return { enabled: false, reason: 'LLM_ENABLED is false', keyPresent, rawFlag };
  }
  if (flag === true) {
    return {
      enabled: keyPresent,
      reason: keyPresent
        ? 'LLM_ENABLED=true and ANTHROPIC_API_KEY set'
        : 'LLM_ENABLED=true but ANTHROPIC_API_KEY missing/short',
      keyPresent,
      rawFlag,
    };
  }
  // Flag unset — auto-enable when key is present (common Railway setup).
  if (keyPresent) {
    return {
      enabled: true,
      reason: 'ANTHROPIC_API_KEY set (LLM_ENABLED unset → auto on)',
      keyPresent,
      rawFlag,
    };
  }
  return {
    enabled: false,
    reason: 'Set LLM_ENABLED=true and ANTHROPIC_API_KEY',
    keyPresent,
    rawFlag,
  };
}
