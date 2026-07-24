import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Logger } from '@nestjs/common';

const logger = new Logger('PrismaMigrate');

function resolveSchemaPath(): string {
  const candidates = [
    process.env.PRISMA_SCHEMA,
    join(process.cwd(), 'prisma', 'schema.prisma'),
    join(__dirname, '..', '..', '..', '..', 'prisma', 'schema.prisma'),
    join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Could not find prisma/schema.prisma');
}

/**
 * Apply pending migrations at process boot.
 * Safe to run on every start (migrate deploy is idempotent).
 * Covers Railway setups that override the Docker entrypoint.
 */
export function runMigrations(): void {
  const schema = resolveSchemaPath();
  logger.log(`Applying migrations with schema=${schema}`);
  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', schema], {
    stdio: 'inherit',
    env: process.env,
  });
  logger.log('Migrations up to date');
}
