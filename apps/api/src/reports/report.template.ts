export function renderMarketReportHtml(input: {
  title: string;
  periodLabel: string;
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  countyName: string;
  byLandUse: Array<{ bucket: string; parcel_count: number }>;
  byZip: Array<{ bucket: string; parcel_count: number }>;
  bySubmarket: Array<{ bucket: string; parcel_count: number }>;
  holdBuckets: Array<{ bucket: string; parcel_count: number }>;
  absentee: { total: number; absentee: number; out_of_state: number };
  topAgents: Array<{ name: string; parcelCount: number; ownerCount: number }>;
  comps: {
    comp_count: number;
    priced_count: number;
    avg_price: number;
    median_price: number;
  };
  marketBands: Array<{
    id: string;
    label: string;
    capRateLow?: number;
    capRateHigh?: number;
    rentPsfNote?: string;
  }>;
}): string {
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
  const money = (n: number) =>
    n
      ? `$${Math.round(n).toLocaleString('en-US')}`
      : '—';
  const rows = (items: Array<{ bucket: string; parcel_count: number }>) =>
    items
      .map(
        (r) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${esc(r.bucket)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.parcel_count}</td></tr>`,
      )
      .join('');

  const bandRows = input.marketBands
    .map((b) => {
      const cap =
        b.capRateLow != null && b.capRateHigh != null
          ? `${b.capRateLow}–${b.capRateHigh}%`
          : '—';
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${esc(b.label)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${esc(cap)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${esc(b.rentPsfNote || '—')}</td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${esc(input.title)}</title></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Georgia,serif;color:#111827;">
  <table width="720" style="margin:0 auto;background:#fff;">
    <tr><td style="padding:28px 28px 12px;">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#0f766e;">${esc(input.countyName)} Commercial</div>
      <h1 style="margin:8px 0 4px;font-size:28px;">${esc(input.title)}</h1>
      <div style="color:#6b7280;">${esc(input.periodLabel)}</div>
    </td></tr>
    <tr><td style="padding:12px 28px;">
      <h2 style="font-size:18px;">Inventory by land use</h2>
      <table width="100%">${rows(input.byLandUse)}</table>
    </td></tr>
    <tr><td style="padding:12px 28px;">
      <h2 style="font-size:18px;">Submarket inventory</h2>
      <table width="100%">${rows(input.bySubmarket)}</table>
    </td></tr>
    <tr><td style="padding:12px 28px;">
      <h2 style="font-size:18px;">Hold-period distribution (locked-up supply)</h2>
      <table width="100%">${rows(input.holdBuckets)}</table>
    </td></tr>
    <tr><td style="padding:12px 28px;">
      <h2 style="font-size:18px;">Recorded sale comps (period)</h2>
      <p>${input.comps.comp_count} deeds · ${input.comps.priced_count} with price · avg ${money(input.comps.avg_price)} · median ${money(input.comps.median_price)}</p>
    </td></tr>
    <tr><td style="padding:12px 28px;">
      <h2 style="font-size:18px;">Indicative cap-rate bands (relationship use)</h2>
      <table width="100%"><tr><th align="left" style="padding:6px 8px;">Submarket</th><th align="left" style="padding:6px 8px;">Cap band</th><th align="left" style="padding:6px 8px;">Note</th></tr>${bandRows}</table>
    </td></tr>
    <tr><td style="padding:12px 28px;">
      <h2 style="font-size:18px;">Ownership</h2>
      <p>Absentee: <strong>${pct(input.absentee.absentee, input.absentee.total)}</strong> · Out-of-state mailing: <strong>${pct(input.absentee.out_of_state, input.absentee.total)}</strong> · Base: ${input.absentee.total.toLocaleString()} active commercial parcels</p>
    </td></tr>
    <tr><td style="padding:12px 28px;">
      <h2 style="font-size:18px;">Top registered agents (local signal)</h2>
      <ol>${input.topAgents.map((a) => `<li>${esc(a.name)} — ${a.parcelCount} parcels / ${a.ownerCount} owners</li>`).join('')}</ol>
    </td></tr>
    <tr><td style="padding:12px 28px;">
      <h2 style="font-size:18px;">Mailing ZIP concentration</h2>
      <table width="100%">${rows(input.byZip.slice(0, 10))}</table>
    </td></tr>
    <tr><td style="padding:20px 28px;background:#0f766e;color:#ecfdf5;">
      <div style="font-weight:700;">${esc(input.agentName || 'Your CRE advisor')}</div>
      <div style="font-size:13px;margin-top:4px;">${esc(input.agentPhone)} · ${esc(input.agentEmail)}</div>
    </td></tr>
    <tr><td style="padding:14px 28px;font-size:11px;color:#9ca3af;">
      Methodology: public Greenville County parcel/ownership records ingested and scored by Greenville CRE Lead Engine. Cap bands are indicative conversation aids, not appraisals. For relationship use only.
    </td></tr>
  </table>
</body></html>`;
}

function esc(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
