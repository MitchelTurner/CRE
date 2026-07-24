export interface DigestLeadRow {
  rank: number;
  pin: string;
  situsAddress: string;
  landUse: string;
  score: number;
  whyNow: string;
  ownerName: string;
  parcelLink: string;
}

export function renderDigestHtml(input: {
  weekOf: string;
  countyName: string;
  leads: DigestLeadRow[];
}): string {
  const rows = input.leads
    .map(
      (l) => `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;width:28px;font-weight:700;color:#0f766e;">${l.rank}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          <div style="font-weight:600;color:#111827;">${escapeHtml(l.situsAddress)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(l.landUse)} · Score ${l.score}</div>
          <div style="font-size:14px;color:#374151;margin-top:6px;">${escapeHtml(l.whyNow)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:6px;">Owner: ${escapeHtml(l.ownerName)} · PIN <a href="${escapeHtml(l.parcelLink)}" style="color:#0f766e;">${escapeHtml(l.pin)}</a></div>
        </td>
      </tr>`,
    )
    .join('');

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
            <div style="font-size:14px;margin-top:4px;opacity:0.9;">Week of ${escapeHtml(input.weekOf)} · ${input.leads.length} new</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 16px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${rows || '<tr><td style="padding:24px;color:#6b7280;">No new leads this week.</td></tr>'}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#9ca3af;">
            Public-records lead scores for investment sales. Contact data (if any) is for licensed-agent outreach only — not automated dialing (TCPA/DNC).
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}