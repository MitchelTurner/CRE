import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../digest/email.service';
import { CoverageService } from './coverage.service';

/**
 * Quarterly industrial market report MVP — verified BuildingAttributes only.
 */
@Injectable()
export class IndustrialReportService {
  private readonly logger = new Logger(IndustrialReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly coverage: CoverageService,
  ) {}

  async generate(opts?: { email?: boolean }) {
    const verified = await this.prisma.buildingAttributes.findMany({
      where: {
        verifiedAt: { not: null },
        clearHeightFt: { not: null },
      },
    });

    const parcelIds = verified.map((v) => v.parcelId);
    const parcels = await this.prisma.parcel.findMany({
      where: { id: { in: parcelIds } },
      select: {
        id: true,
        pin: true,
        submarket: true,
        propType: true,
        situsAddress: true,
      },
    });
    const parcelMap = new Map(parcels.map((p) => [p.id, p]));

    type Agg = {
      submarket: string;
      count: number;
      avgClear: number;
      avgSf: number;
      withRail: number;
      avgDocks: number;
      clears: number[];
      sfs: number[];
      docks: number[];
    };
    const bySm = new Map<string, Agg>();

    for (const a of verified) {
      const p = parcelMap.get(a.parcelId);
      const sm = p?.submarket?.trim() || 'Unassigned';
      let agg = bySm.get(sm);
      if (!agg) {
        agg = {
          submarket: sm,
          count: 0,
          avgClear: 0,
          avgSf: 0,
          withRail: 0,
          avgDocks: 0,
          clears: [],
          sfs: [],
          docks: [],
        };
        bySm.set(sm, agg);
      }
      agg.count += 1;
      if (a.clearHeightFt != null) agg.clears.push(a.clearHeightFt);
      if (a.buildingSf != null) agg.sfs.push(a.buildingSf);
      if (a.dockDoors != null) agg.docks.push(a.dockDoors);
      if (a.railServed) agg.withRail += 1;
    }

    const rows = [...bySm.values()].map((agg) => ({
      submarket: agg.submarket,
      verifiedBuildings: agg.count,
      avgClearHeightFt: avg(agg.clears),
      medianClearHeightFt: median(agg.clears),
      avgBuildingSf: avg(agg.sfs),
      avgDockDoors: avg(agg.docks),
      railServedPct: agg.count ? Math.round((agg.withRail / agg.count) * 1000) / 10 : 0,
    }));

    const coverage = await this.coverage.bySubmarket();
    const countyName = this.config.get<string>('countyName') ?? 'Greenville';
    const periodLabel = new Date().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/New_York',
    });
    const title = `${countyName} Industrial Spec Snapshot — ${periodLabel}`;
    const html = renderIndustrialReportHtml({
      title,
      countyName,
      periodLabel,
      verifiedCount: verified.length,
      coveragePct: coverage.pct,
      rows,
      coverageBySubmarket: coverage.bySubmarket,
    });

    const report = await this.prisma.report.create({
      data: {
        kind: 'industrial_quarterly',
        periodStart: new Date(
          new Date().getFullYear(),
          Math.floor(new Date().getMonth() / 3) * 3,
          1,
        ),
        periodEnd: new Date(),
        htmlBody: html,
        stats: {
          title,
          kind: 'industrial_verified',
          verifiedCount: verified.length,
          coverage,
          rows,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    if (opts?.email) {
      const recipients = this.config.get<string[]>('digestRecipients') ?? [];
      if (recipients.length) {
        await this.email.send({
          to: recipients,
          subject: title,
          html,
        });
        this.logger.log(`Industrial report ${report.id} emailed to ${recipients.length}`);
      }
    }

    return { reportId: report.id, title, verifiedCount: verified.length, html, coverage };
  }
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 10) / 10;
}

function renderIndustrialReportHtml(input: {
  title: string;
  countyName: string;
  periodLabel: string;
  verifiedCount: number;
  coveragePct: number;
  rows: Array<{
    submarket: string;
    verifiedBuildings: number;
    avgClearHeightFt: number;
    medianClearHeightFt: number;
    avgBuildingSf: number;
    avgDockDoors: number;
    railServedPct: number;
  }>;
  coverageBySubmarket: Array<{
    submarket: string;
    eligible: number;
    withVerifiedClear: number;
    pct: number;
  }>;
}): string {
  const rowHtml = input.rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(r.submarket)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.verifiedBuildings}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.avgClearHeightFt}'</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.medianClearHeightFt}'</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${Math.round(r.avgBuildingSf).toLocaleString('en-US')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.avgDockDoors}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.railServedPct}%</td>
      </tr>`,
    )
    .join('');

  const covHtml = input.coverageBySubmarket
    .map(
      (c) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(c.submarket)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${c.withVerifiedClear}/${c.eligible}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${c.pct}%</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111827;">
  <h1 style="font-size:22px;">${esc(input.title)}</h1>
  <p style="color:#6b7280;">Verified BuildingAttributes only — inferred/unverified values excluded. Coverage KPI: ${input.coveragePct}% of industrial ≥20k SF with verified clear height (${input.verifiedCount} verified buildings).</p>
  <h2 style="font-size:16px;margin-top:24px;">Verified stock by submarket</h2>
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th align="left" style="padding:8px;">Submarket</th>
        <th align="right" style="padding:8px;">Buildings</th>
        <th align="right" style="padding:8px;">Avg clear</th>
        <th align="right" style="padding:8px;">Median clear</th>
        <th align="right" style="padding:8px;">Avg SF</th>
        <th align="right" style="padding:8px;">Avg docks</th>
        <th align="right" style="padding:8px;">Rail %</th>
      </tr>
    </thead>
    <tbody>${rowHtml || '<tr><td colspan="7" style="padding:12px;color:#9ca3af;">No verified attributes yet.</td></tr>'}</tbody>
  </table>
  <h2 style="font-size:16px;margin-top:28px;">Clear-height coverage (moat KPI)</h2>
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th align="left" style="padding:8px;">Submarket</th>
        <th align="right" style="padding:8px;">Verified / eligible</th>
        <th align="right" style="padding:8px;">Coverage</th>
      </tr>
    </thead>
    <tbody>${covHtml || '<tr><td colspan="3" style="padding:12px;color:#9ca3af;">No eligible industrial parcels.</td></tr>'}</tbody>
  </table>
  <p style="margin-top:24px;font-size:12px;color:#9ca3af;">${esc(input.countyName)} CRE Lead Engine — internal industrial snapshot.</p>
</body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
