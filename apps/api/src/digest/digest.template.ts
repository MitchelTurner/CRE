export interface DigestLeadRow {
  rank: number;
  pin: string;
  situsAddress: string;
  landUse: string;
  score: number;
  whyNow: string;
  ownerName: string;
  parcelLink: string;
  hot?: boolean;
}

export interface DigestEventRow {
  name: string;
  whenLabel: string;
  venue: string | null;
  ownerDensity: string | null;
  url: string | null;
}

export interface DigestMoverRow {
  companyName: string;
  score: number;
  previousScore: number;
  delta: number;
  bandLabel: string;
  propertyLabel: string;
  signalHeadline: string;
  talkTrack: string | null;
}

export function renderDigestHtml(input: {
  weekOf: string;
  countyName: string;
  hotLeads: DigestLeadRow[];
  evergreenLeads: DigestLeadRow[];
  events?: DigestEventRow[];
  estateLeads?: DigestLeadRow[];
  movers?: DigestMoverRow[];
}): string {
  const moversSection = moversHtml(input.movers ?? []);
  const hotSection = sectionHtml('Hot this week', 'New catalysts — tax, foreclosure, maturity, zoning, permits, 1031, probate', input.hotLeads);
  const evergreenSection = sectionHtml(
    'Evergreen long-holds',
    'Strong sell-likelihood without a brand-new catalyst',
    input.evergreenLeads,
  );
  const estateSection = sectionHtml(
    'Estate / probate leads',
    'Sensitive outreach — timing and tone are your judgment (default 60-day delay)',
    input.estateLeads ?? [],
  );
  const eventsSection = eventsHtml(input.events ?? []);
  const total = input.hotLeads.length + input.evergreenLeads.length;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${escapeHtml(input.countyName)} CRE Leads</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr>
          <td style="background:#0f766e;color:#ecfdf5;padding:20px 24px;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Weekly Digest</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;">${escapeHtml(input.countyName)} CRE Leads</div>
            <div style="font-size:14px;margin-top:4px;opacity:0.9;">Week of ${escapeHtml(input.weekOf)} · ${total} new · ${input.hotLeads.length} hot · ${(input.movers ?? []).length} movers</div>
          </td>
        </tr>
        ${moversSection}
        ${eventsSection}
        ${hotSection}
        ${estateSection}
        ${evergreenSection}
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#9ca3af;">
            Public-records lead scores for investment sales. Contact data (if any) is for licensed-agent outreach only — not automated dialing (TCPA/DNC). Event briefs are internal prep only.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function moversHtml(movers: DigestMoverRow[]): string {
  if (!movers.length) {
    return `
      <tr>
        <td style="padding:20px 24px 8px;">
          <div style="font-size:16px;font-weight:700;color:#111827;">Movers — space-change score</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">Occupiers whose SpaceScore rose ≥20 pts</div>
          <div style="padding:16px 0;color:#9ca3af;font-size:14px;">None this week — run UCC/FMCSA ingest from Admin → Signals.</div>
        </td>
      </tr>`;
  }
  const rows = movers
    .map(
      (m) => `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          <div style="font-weight:600;color:#111827;">${escapeHtml(m.companyName)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">
            SpaceScore ${m.previousScore.toFixed(0)} → ${m.score.toFixed(0)} (+${m.delta.toFixed(0)}) · ${escapeHtml(m.bandLabel)} · ${escapeHtml(m.propertyLabel)}
          </div>
          <div style="font-size:14px;color:#374151;margin-top:6px;">${escapeHtml(m.signalHeadline)}</div>
          ${
            m.talkTrack
              ? `<div style="font-size:13px;color:#0f766e;margin-top:8px;padding:8px 10px;background:#f0fdfa;border-left:3px solid #0f766e;">${escapeHtml(m.talkTrack)}</div>`
              : ''
          }
        </td>
      </tr>`,
    )
    .join('');
  return `
    <tr>
      <td style="padding:20px 24px 0;">
        <div style="font-size:16px;font-weight:700;color:#111827;">Movers — space-change score</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px;margin-bottom:8px;">Who needs a different building, and when</div>
        <table role="presentation" width="100%">${rows}</table>
      </td>
    </tr>`;
}

function eventsHtml(events: DigestEventRow[]): string {
  if (!events.length) {
    return `
      <tr>
        <td style="padding:20px 24px 8px;">
          <div style="font-size:16px;font-weight:700;color:#111827;">Events in the next 2 weeks</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">High owner-density first</div>
          <div style="padding:16px 0;color:#9ca3af;font-size:14px;">None queued — add via Admin or run event sync.</div>
        </td>
      </tr>`;
  }
  const rows = events
    .map(
      (e) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">
          <div style="font-weight:600;">${escapeHtml(e.name)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(e.whenLabel)} · ${escapeHtml(e.venue ?? 'TBD')} · density ${escapeHtml(e.ownerDensity ?? '?')}</div>
          ${e.url ? `<div style="font-size:12px;margin-top:4px;"><a href="${escapeHtml(e.url)}" style="color:#0f766e;">Details</a></div>` : ''}
        </td>
      </tr>`,
    )
    .join('');
  return `
    <tr>
      <td style="padding:20px 24px 0;">
        <div style="font-size:16px;font-weight:700;color:#111827;">Events in the next 2 weeks</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px;margin-bottom:8px;">High owner-density first — walk in knowing who owns what</div>
        <table role="presentation" width="100%">${rows}</table>
      </td>
    </tr>`;
}

function sectionHtml(title: string, subtitle: string, leads: DigestLeadRow[]): string {
  if (!leads.length) {
    return `
      <tr>
        <td style="padding:20px 24px 8px;">
          <div style="font-size:16px;font-weight:700;color:#111827;">${escapeHtml(title)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(subtitle)}</div>
          <div style="padding:16px 0;color:#9ca3af;font-size:14px;">None this week.</div>
        </td>
      </tr>`;
  }

  const rows = leads
    .map(
      (l) => `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;width:28px;font-weight:700;color:#0f766e;">${l.rank}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          <div style="font-weight:600;color:#111827;">${escapeHtml(l.situsAddress)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(l.landUse)} · Score ${l.score}${l.hot ? ' · HOT' : ''}</div>
          <div style="font-size:14px;color:#374151;margin-top:6px;">${escapeHtml(l.whyNow)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:6px;">Owner: ${escapeHtml(l.ownerName)} · PIN <a href="${escapeHtml(l.parcelLink)}" style="color:#0f766e;">${escapeHtml(l.pin)}</a></div>
        </td>
      </tr>`,
    )
    .join('');

  return `
    <tr>
      <td style="padding:20px 24px 0;">
        <div style="font-size:16px;font-weight:700;color:#111827;">${escapeHtml(title)}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px;margin-bottom:8px;">${escapeHtml(subtitle)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
      </td>
    </tr>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
