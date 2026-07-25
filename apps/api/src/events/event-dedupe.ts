import { createHash } from 'node:crypto';

export function eventDedupeKey(name: string, startsAt: Date, venue?: string | null): string {
  const norm = [
    name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    startsAt.toISOString().slice(0, 10),
    (venue ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  ].join('|');
  return createHash('sha256').update(norm).digest('hex').slice(0, 32);
}
