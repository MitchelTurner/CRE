import type { AwardResult } from './types';

type Push = (message: string, tone?: 'info' | 'success' | 'danger' | 'xp') => void;

/** Surface XP / level / badge feedback after an action. Returns true if XP was awarded. */
export function announceAward(push: Push, award?: AwardResult | null, fallback?: string) {
  if (award?.awarded && award.message) {
    push(award.message, 'xp');
    return true;
  }
  if (fallback) push(fallback, 'success');
  return false;
}
