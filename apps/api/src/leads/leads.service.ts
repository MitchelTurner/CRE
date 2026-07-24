import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_STATUSES = new Set(['new', 'sent', 'contacted', 'dead', 'deal']);

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(id: string, status: string) {
    if (!ALLOWED_STATUSES.has(status)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${[...ALLOWED_STATUSES].join(', ')}`,
      );
    }

    try {
      return await this.prisma.lead.update({
        where: { id },
        data: { status },
      });
    } catch {
      throw new NotFoundException(`Lead ${id} not found`);
    }
  }
}