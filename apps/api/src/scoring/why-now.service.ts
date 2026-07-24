import { Injectable } from '@nestjs/common';
import { yearsSince, type ScoreComponents } from '@cre/shared';

export interface WhyNowInput {
  deedDate: Date | null;
  ownerName: string;
  isEntity: boolean;
  isAbsentee: boolean;
  mailingState: string | null;
  homeState: string;
  activeCommercialParcelCount: number;
  landUseCode: string | null;
  propType: string | null;
  components: ScoreComponents;
}

/**
 * Template-based whyNow. Kept as a service so an LLM can slot in later.
 */
@Injectable()
export class WhyNowService {
  generate(input: WhyNowInput): string {
    const parts: string[] = [];

    const years = yearsSince(input.deedDate);
    if (years !== null && years >= 3) {
      const y = Math.floor(years);
      parts.push(`Owned ${y} year${y === 1 ? '' : 's'}`);
    } else if (input.components.missingDeedDate) {
      parts.push('Deed date unknown');
    } else {
      parts.push('Recently acquired');
    }

    const ownerBits: string[] = [];
    if (input.isAbsentee && input.mailingState && input.mailingState !== input.homeState) {
      ownerBits.push(`an out-of-state ${input.isEntity ? 'entity' : 'owner'}`);
    } else if (input.isAbsentee) {
      ownerBits.push(input.isEntity ? 'an absentee entity' : 'an absentee owner');
    } else if (input.isEntity) {
      ownerBits.push('an entity owner');
    }

    if (ownerBits.length) {
      parts.push(`by ${ownerBits[0]}`);
    } else {
      parts.push(`by ${input.ownerName}`);
    }

    if (input.activeCommercialParcelCount >= 3) {
      parts.push(
        `that holds ${input.activeCommercialParcelCount} commercial parcels in the county`,
      );
    }

    if (input.propType) {
      parts.push(`(${input.propType.toLowerCase()})`);
    } else if (input.landUseCode) {
      parts.push(`(land use ${input.landUseCode})`);
    }

    // Capitalize first letter; join with spaces; ensure period.
    let line = parts.join(' ').replace(/\s+/g, ' ').trim();
    line = line.charAt(0).toUpperCase() + line.slice(1);
    if (!line.endsWith('.')) line += '.';
    return line;
  }
}