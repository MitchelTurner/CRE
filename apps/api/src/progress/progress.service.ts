import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BADGES,
  DEFAULT_USER_KEY,
  XP_REWARDS,
  levelFromXp,
  questsForToday,
  xpProgressInLevel,
} from './progress.rules';

export type AwardResult = {
  awarded: boolean;
  xpDelta: number;
  xp: number;
  level: number;
  leveledUp: boolean;
  streakDays: number;
  newBadges: Array<{ id: string; name: string; description: string }>;
  message: string | null;
};

@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userKey = DEFAULT_USER_KEY) {
    const progress = await this.ensureProgress(userKey);
    const bar = xpProgressInLevel(progress.xp);
    const badges = await this.prisma.userBadge.findMany({
      where: { userKey },
      orderBy: { earnedAt: 'desc' },
    });
    const badgeMap = new Map(BADGES.map((b) => [b.id, b]));
    const recent = await this.prisma.xpEvent.findMany({
      where: { userKey },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const start = startOfLocalDay();
    const [connectionsToday, callsLoggedToday, peopleMetToday, notesToday, eventsAttended] =
      await Promise.all([
        this.prisma.xpEvent.count({
          where: { userKey, action: 'connected', createdAt: { gte: start } },
        }),
        this.prisma.xpEvent.count({
          where: {
            userKey,
            action: { in: ['connected', 'voicemail', 'callback', 'wrong_number', 'not_seller'] },
            createdAt: { gte: start },
          },
        }),
        this.prisma.xpEvent.count({
          where: { userKey, action: 'person_met', createdAt: { gte: start } },
        }),
        this.prisma.xpEvent.count({
          where: { userKey, action: 'note_created', createdAt: { gte: start } },
        }),
        this.prisma.xpEvent.count({
          where: { userKey, action: 'event_attended' },
        }),
      ]);

    const earnedIds = new Set(badges.map((b) => b.badgeId));
    return {
      xp: progress.xp,
      level: bar.level,
      streakDays: progress.streakDays,
      lastActiveOn: progress.lastActiveOn,
      intoLevel: bar.intoLevel,
      needForNext: bar.needForNext,
      pct: bar.pct,
      rewards: XP_REWARDS,
      quests: questsForToday({
        connectionsToday,
        callsLoggedToday,
        peopleMetToday,
        notesToday,
        eventsAttended,
      }),
      badges: {
        earned: badges.map((b) => {
          const def = badgeMap.get(b.badgeId);
          return {
            id: b.badgeId,
            name: def?.name ?? b.badgeId,
            description: def?.description ?? '',
            how: def?.how ?? '',
            earnedAt: b.earnedAt,
          };
        }),

        catalog: BADGES.map((b) => ({
          ...b,
          earned: earnedIds.has(b.id),
        })),
      },
      recent: recent.map((r) => ({
        id: r.id,
        action: r.action,
        xpDelta: r.xpDelta,
        entityType: r.entityType,
        entityId: r.entityId,
        createdAt: r.createdAt,
      })),
    };
  }

  async award(input: {
    action: string;
    entityType?: string;
    entityId?: string;
    userKey?: string;
    meta?: Record<string, unknown>;
    xpOverride?: number;
  }): Promise<AwardResult> {
    const userKey = input.userKey ?? DEFAULT_USER_KEY;
    const xpDelta = input.xpOverride ?? XP_REWARDS[input.action] ?? 0;
    if (xpDelta <= 0) {
      const progress = await this.ensureProgress(userKey);
      return {
        awarded: false,
        xpDelta: 0,
        xp: progress.xp,
        level: progress.level,
        leveledUp: false,
        streakDays: progress.streakDays,
        newBadges: [],
        message: null,
      };
    }

    const entityId = input.entityId ?? `${input.action}:${Date.now()}`;

    try {
      await this.prisma.xpEvent.create({
        data: {
          userKey,
          action: input.action,
          xpDelta,
          entityType: input.entityType ?? null,
          entityId,
          meta: (input.meta as Prisma.InputJsonValue) ?? undefined,
        },
      });
    } catch (err) {
      // Unique violation = already awarded for this action+entity
      const progress = await this.ensureProgress(userKey);
      this.logger.debug(
        `XP skip duplicate ${input.action}/${entityId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        awarded: false,
        xpDelta: 0,
        xp: progress.xp,
        level: progress.level,
        leveledUp: false,
        streakDays: progress.streakDays,
        newBadges: [],
        message: null,
      };
    }

    const before = await this.ensureProgress(userKey);
    const streakDays = nextStreak(before.lastActiveOn, before.streakDays);
    const xp = before.xp + xpDelta;
    const level = levelFromXp(xp);
    const leveledUp = level > before.level;

    await this.prisma.userProgress.update({
      where: { userKey },
      data: {
        xp,
        level,
        streakDays,
        lastActiveOn: new Date(),
      },
    });

    const newBadges = await this.evaluateBadges(userKey, { streakDays, level });

    return {
      awarded: true,
      xpDelta,
      xp,
      level,
      leveledUp,
      streakDays,
      newBadges,
      message: formatAwardMessage({
        action: input.action,
        xpDelta,
        leveledUp,
        level,
        newBadges,
      }),
    };
  }

  private async ensureProgress(userKey: string) {
    const existing = await this.prisma.userProgress.findUnique({ where: { userKey } });
    if (existing) return existing;
    return this.prisma.userProgress.create({
      data: { userKey, xp: 0, level: 1, streakDays: 0 },
    });
  }

  private async evaluateBadges(
    userKey: string,
    state: { streakDays: number; level: number },
  ) {
    const counts = await this.prisma.xpEvent.groupBy({
      by: ['action'],
      where: { userKey },
      _count: { _all: true },
    });
    const byAction = Object.fromEntries(counts.map((c) => [c.action, c._count._all]));
    const noteCount = byAction.note_created ?? 0;
    const connected = byAction.connected ?? 0;
    const events = byAction.event_attended ?? 0;
    const met = byAction.person_met ?? 0;
    const deals = byAction.deal ?? 0;

    const unlock: string[] = [];
    if (connected >= 1) unlock.push('first_connection');
    if (connected >= 5) unlock.push('connector_5');
    if (connected >= 25) unlock.push('connector_25');
    if (events >= 1) unlock.push('first_event');
    if (events >= 3) unlock.push('event_3');
    if (met >= 1) unlock.push('handshake');
    if (met >= 10) unlock.push('handshake_10');
    if (noteCount >= 5) unlock.push('note_taker');
    if (deals >= 1) unlock.push('closer');
    if (state.streakDays >= 3) unlock.push('streak_3');
    if (state.streakDays >= 7) unlock.push('streak_7');
    if (state.level >= 5) unlock.push('level_5');

    const earned = await this.prisma.userBadge.findMany({ where: { userKey } });
    const have = new Set(earned.map((b) => b.badgeId));
    const fresh: Array<{ id: string; name: string; description: string }> = [];

    for (const id of unlock) {
      if (have.has(id)) continue;
      const def = BADGES.find((b) => b.id === id);
      if (!def) continue;
      try {
        await this.prisma.userBadge.create({ data: { userKey, badgeId: id } });
        fresh.push({ id: def.id, name: def.name, description: def.description });
      } catch {
        /* race */
      }
    }
    return fresh;
  }
}

function startOfLocalDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextStreak(lastActiveOn: Date | null, current: number): number {
  if (!lastActiveOn) return 1;
  const last = new Date(lastActiveOn);
  last.setHours(0, 0, 0, 0);
  const today = startOfLocalDay();
  const diffDays = Math.round((today.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return Math.max(1, current);
  if (diffDays === 1) return current + 1;
  return 1;
}

function formatAwardMessage(input: {
  action: string;
  xpDelta: number;
  leveledUp: boolean;
  level: number;
  newBadges: Array<{ name: string }>;
}): string {
  const parts = [`+${input.xpDelta} XP`];
  if (input.leveledUp) parts.push(`Level ${input.level}!`);
  if (input.newBadges[0]) parts.push(`Badge: ${input.newBadges[0].name}`);
  return parts.join(' · ');
}
