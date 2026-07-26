import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';

const KINDS = new Set(['property', 'connection', 'meeting']);

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
  ) {}

  async list(query: {
    kind?: string;
    parcelId?: string;
    personId?: string;
    leadId?: string;
    eventId?: string;
  }) {
    if (query.kind && !KINDS.has(query.kind)) {
      throw new BadRequestException(`Invalid kind. Allowed: ${[...KINDS].join(', ')}`);
    }
    const items = await this.prisma.note.findMany({
      where: {
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.parcelId ? { parcelId: query.parcelId } : {}),
        ...(query.personId ? { personId: query.personId } : {}),
        ...(query.leadId ? { leadId: query.leadId } : {}),
        ...(query.eventId ? { eventId: query.eventId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        parcel: { select: { id: true, pin: true, situsAddress: true } },
        person: { select: { id: true, nameRaw: true, company: true } },
        lead: {
          select: {
            id: true,
            status: true,
            parcel: { select: { pin: true, situsAddress: true } },
          },
        },
        event: { select: { id: true, name: true, startsAt: true } },
      },
    });
    return { items };
  }

  async create(input: {
    kind: string;
    body: string;
    title?: string;
    parcelId?: string;
    personId?: string;
    leadId?: string;
    eventId?: string;
    meetingAt?: string;
  }) {
    if (!KINDS.has(input.kind)) {
      throw new BadRequestException(`Invalid kind. Allowed: ${[...KINDS].join(', ')}`);
    }
    const body = input.body?.trim();
    if (!body) throw new BadRequestException('body required');

    const meetingAt = input.meetingAt ? new Date(input.meetingAt) : null;
    if (meetingAt && Number.isNaN(meetingAt.getTime())) {
      throw new BadRequestException('meetingAt invalid');
    }

    const note = await this.prisma.note.create({
      data: {
        kind: input.kind,
        title: input.title?.trim() || null,
        body,
        parcelId: input.parcelId || null,
        personId: input.personId || null,
        leadId: input.leadId || null,
        eventId: input.eventId || null,
        meetingAt,
      },
    });

    const award = await this.progress.award({
      action: 'note_created',
      entityType: 'note',
      entityId: note.id,
      meta: { kind: input.kind },
    });

    return { note, award };
  }

  async update(id: string, input: { body?: string; title?: string; meetingAt?: string | null }) {
    const existing = await this.prisma.note.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Note ${id} not found`);

    let meetingAt: Date | null | undefined = undefined;
    if (input.meetingAt === null) meetingAt = null;
    else if (typeof input.meetingAt === 'string') {
      meetingAt = new Date(input.meetingAt);
      if (Number.isNaN(meetingAt.getTime())) throw new BadRequestException('meetingAt invalid');
    }

    const note = await this.prisma.note.update({
      where: { id },
      data: {
        ...(input.body !== undefined ? { body: input.body.trim() } : {}),
        ...(input.title !== undefined ? { title: input.title.trim() || null } : {}),
        ...(meetingAt !== undefined ? { meetingAt } : {}),
      },
    });
    return { note };
  }

  async remove(id: string) {
    try {
      await this.prisma.note.delete({ where: { id } });
      return { ok: true };
    } catch {
      throw new NotFoundException(`Note ${id} not found`);
    }
  }
}
