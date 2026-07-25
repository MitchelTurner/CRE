import type { RawEventDraft } from './event-source.types';

const HIGH =
  /\b(investor|1031|naiop|crew|ccim|ucreia|estate.?plan|developer|landlord|owner.?round|capital|opportunity.?zone)\b/i;
const LOW =
  /\b(homebuyer|first.?time|credit.?repair|pre.?licensing|license.?exam|residential.?agent.?training|open.?house.?tour)\b/i;
const NETWORKING = /\b(network|mixer|happy.?hour|golf|social|breakfast|lunch)\b/i;
const CONFERENCE = /\b(conference|summit|symposium|expo|forum)\b/i;
const EDUCATION = /\b(seminar|webinar|ceu|class|course|workshop|education)\b/i;

/**
 * Heuristic classification when LLM is disabled.
 * Investor associations / 1031 / developer orgs → high; agent training / homebuyer → low.
 */
export function classifyEventHeuristic(
  draft: Pick<RawEventDraft, 'name' | 'hostOrg' | 'category' | 'ownerDensity' | 'audience'>,
): Pick<RawEventDraft, 'category' | 'ownerDensity' | 'audience'> {
  const blob = `${draft.name} ${draft.hostOrg ?? ''}`;
  let ownerDensity: 'high' | 'medium' | 'low' = 'medium';
  if (LOW.test(blob)) ownerDensity = 'low';
  else if (HIGH.test(blob)) ownerDensity = 'high';

  let category = draft.category ?? 'networking';
  if (CONFERENCE.test(blob)) category = 'conference';
  else if (EDUCATION.test(blob)) category = 'education';
  else if (/\bgolf\b/i.test(blob)) category = 'golf/social';
  else if (NETWORKING.test(blob)) category = 'networking';
  else if (/\bexpo\b/i.test(blob)) category = 'expo';
  else if (/\bseminar\b/i.test(blob)) category = 'seminar';

  let audience = draft.audience ?? 'mixed';
  if (ownerDensity === 'high') audience = /broker|agent/i.test(blob) ? 'mixed' : 'investors';
  if (ownerDensity === 'low') audience = 'brokers';

  return {
    category,
    ownerDensity: draft.ownerDensity ?? ownerDensity,
    audience,
  };
}
