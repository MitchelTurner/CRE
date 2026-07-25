import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { EmailService } from '../digest/email.service';
import { REPORT_QUERIES } from './report-queries';
import { renderMarketReportHtml } from './report.template';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly agents: AgentsService,
    private readonly email: EmailService,
  ) {}

  async generateQuarterly(emailAgent = true) {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 3);

    const homeState = this.config.get<string>('countyHomeState') ?? 'SC';
    const [byLandUse, byZip, holdBuckets, absenteeRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ bucket: string; parcel_count: number }>>(
        REPORT_QUERIES.byLandUse,
      ),
      this.prisma.$queryRawUnsafe<Array<{ bucket: string; parcel_count: number }>>(
        REPORT_QUERIES.byZip,
      ),
      this.prisma.$queryRawUnsafe<Array<{ bucket: string; parcel_count: number }>>(
        REPORT_QUERIES.holdBuckets,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{ total: number; absentee: number; out_of_state: number }>
      >(REPORT_QUERIES.absenteeShare, homeState),
    ]);

    const absentee = absenteeRows[0] ?? { total: 0, absentee: 0, out_of_state: 0 };
    const topAgents = (await this.agents.rank(15)).items;
    const countyName = this.config.get<string>('countyName') ?? 'Greenville';
    const agentName = this.config.get<string>('outreachAgentName') ?? '';
    const agentPhone = this.config.get<string>('outreachAgentPhone') ?? '';
    const agentEmail =
      this.config.get<string>('outreachAgentEmail') ??
      (this.config.get<string[]>('digestRecipients') ?? [])[0] ??
      '';

    const periodLabel = `${periodStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${periodEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    const title = `${countyName} Commercial Market Report`;

    const stats = {
      byLandUse,
      byZip,
      holdBuckets,
      absentee,
      topAgents,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };

    const htmlBody = renderMarketReportHtml({
      title,
      periodLabel,
      agentName,
      agentPhone,
      agentEmail,
      countyName,
      byLandUse,
      byZip,
      holdBuckets,
      absentee,
      topAgents,
    });

    const report = await this.prisma.report.create({
      data: {
        kind: 'quarterly',
        periodStart,
        periodEnd,
        stats: stats as unknown as Prisma.InputJsonValue,
        htmlBody,
      },
    });

    if (emailAgent) {
      const recipients = this.config.get<string[]>('digestRecipients') ?? [];
      if (recipients.length) {
        await this.email.send({
          to: recipients,
          subject: `${title} — ${periodLabel}`,
          html: htmlBody,
        });
      }
    }

    this.logger.log(`Report ${report.id} generated`);
    return report;
  }

  async list(limit = 10) {
    return this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      select: {
        id: true,
        kind: true,
        periodStart: true,
        periodEnd: true,
        createdAt: true,
      },
    });
  }

  async get(id: string) {
    return this.prisma.report.findUnique({ where: { id } });
  }
}
