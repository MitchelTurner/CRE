export type BriefMatchRow = {
  personName: string;
  company: string | null;
  role: string;
  confidence: number;
  method: string;
  ownerName: string;
  parcels: Array<{
    address: string;
    landUse: string;
    holdYears: number | null;
    score: number | null;
  }>;
  opener: string;
};

export function renderEventBriefHtml(input: {
  eventName: string;
  startsAt: string;
  venue: string | null;
  hostOrg: string | null;
  ownerDensity: string | null;
  matches: BriefMatchRow[];
  unmatched: Array<{ name: string; company: string | null; role: string }>;
}): string {
  const matchRows = input.matches
    .map(
      (m) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          <div style="font-weight:700;">${esc(m.personName)}</div>
          <div style="font-size:12px;color:#6b7280;">${esc(m.company ?? '—')} · ${esc(m.role)}</div>
          <div style="font-size:12px;color:#0f766e;margin-top:4px;">match ${Math.round(m.confidence * 100)}% · ${esc(m.method)} · owner ${esc(m.ownerName)}</div>
          <ul style="margin:6px 0 0;padding-left:16px;font-size:13px;color:#374151;">
            ${m.parcels
              .map(
                (p) =>
                  `<li>${esc(p.address)} · ${esc(p.landUse)} · hold ${p.holdYears ?? '?'}y · score ${p.score ?? '—'}</li>`,
              )
              .join('')}
          </ul>
          <div style="margin-top:6px;font-size:13px;color:#111827;"><em>Opener:</em> ${esc(m.opener)}</div>
        </td>
      </tr>`,
    )
    .join('');

  const unmatched =
    input.unmatched.length === 0
      ? '<div style="color:#9ca3af;font-size:13px;">None listed.</div>'
      : `<ul>${input.unmatched
          .map(
            (u) =>
              `<li style="font-size:13px;">${esc(u.name)}${u.company ? ` · ${esc(u.company)}` : ''} · ${esc(u.role)}</li>`,
          )
          .join('')}</ul>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Event brief — ${esc(input.eventName)}</title></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Georgia,serif;">
  <table width="640" style="background:#fff;margin:0 auto;">
    <tr><td style="background:#0f766e;color:#ecfdf5;padding:18px 22px;">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Pre-event brief · internal only</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">${esc(input.eventName)}</div>
      <div style="font-size:13px;margin-top:4px;opacity:.9;">${esc(input.startsAt)} · ${esc(input.venue ?? 'TBD')} · ${esc(input.hostOrg ?? '')} · density ${esc(input.ownerDensity ?? '?')}</div>
    </td></tr>
    <tr><td style="padding:18px 22px;">
      <div style="font-size:16px;font-weight:700;">Matched owners in the room (${input.matches.length})</div>
      <div style="font-size:12px;color:#6b7280;margin:4px 0 10px;">Confidence always shown. Do not claim unverified relationships.</div>
      <table width="100%">${matchRows || '<tr><td style="color:#9ca3af;padding:12px 0;">No auto-matches above threshold.</td></tr>'}</table>
    </td></tr>
    <tr><td style="padding:0 22px 22px;">
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">Unmatched notables</div>
      ${unmatched}
    </td></tr>
    <tr><td style="padding:12px 22px;background:#f9fafb;font-size:11px;color:#9ca3af;">
      Public directories / lawfully obtained lists only. No LinkedIn automation. Brief is internal prep material.
    </td></tr>
  </table>
</body></html>`;
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function templateOpener(input: {
  personName: string;
  parcelAddress: string;
  holdYears: number | null;
}): string {
  const hold =
    input.holdYears != null ? `after ${input.holdYears}+ years` : 'when timing is right';
  return `Hi ${input.personName.split(' ')[0] || input.personName} — curious if you've thought about ${input.parcelAddress} ${hold}. Happy to share what we're seeing on pricing.`;
}
