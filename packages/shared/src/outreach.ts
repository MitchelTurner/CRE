export interface OutreachDraftInput {
  ownerName: string;
  situsAddress: string;
  pin: string;
  whyNow: string;
  propType?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  agentName?: string;
  countyName?: string;
  /** Submarket id (e.g. downtown) — optional market-band line in drafts. */
  submarket?: string | null;
  /** e.g. "Downtown typically clears ~5.5–7.5% cap" */
  marketBandNote?: string | null;
}

export interface OutreachDrafts {
  callScript: string;
  emailSubject: string;
  emailBody: string;
}

export function buildOutreachDrafts(input: OutreachDraftInput): OutreachDrafts {
  const agent = input.agentName?.trim() || 'your local CRE advisor';
  const county = input.countyName ?? 'Greenville';
  const contact = input.contactName || input.ownerName;
  const asset = input.propType ? input.propType.toLowerCase() : 'commercial';
  const address = input.situsAddress || `PIN ${input.pin}`;
  const band = input.marketBandNote?.trim();

  const callScript = [
    `Hi ${firstName(contact)} — this is ${agent} in ${county}.`,
    `I'm reaching out about your ${asset} property at ${address}.`,
    `${input.whyNow}`,
    band ? `For context, ${band}.` : null,
    `Curious if you've thought about a sale or 1031 exchange in the next 6–12 months, or if you'd like a quiet off-market read on value?`,
    `Happy to keep it confidential — no listing obligation.`,
  ]
    .filter(Boolean)
    .join(' ');

  const emailSubject = `${county} CRE — quick question on ${address}`;
  const emailBody = [
    `Hi ${firstName(contact)},`,
    ``,
    `I work investment sales in ${county} County and came across your ${asset} property at ${address} (PIN ${input.pin}).`,
    ``,
    input.whyNow,
    band ? `` : null,
    band ? band : null,
    ``,
    `If a sale, refinance, or 1031 replacement is even vaguely on the radar, I'd welcome a short conversation — completely confidential.`,
    ``,
    `Best,`,
    agent,
    input.contactPhone ? `P: ${input.contactPhone}` : '',
    input.contactEmail ? `E: ${input.contactEmail}` : '',
  ]
    .filter((line, i, arr) => line !== null && !(line === '' && arr[i - 1] === ''))
    .join('\n')
    .trim();

  return { callScript, emailSubject, emailBody };
}

function firstName(name: string): string {
  const cleaned = name.replace(/[,.].*$/, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'there';
  // Entities: use full short name
  if (/\b(LLC|INC|LP|TRUST|CORP)\b/i.test(cleaned)) return cleaned;
  return parts[0]!;
}
