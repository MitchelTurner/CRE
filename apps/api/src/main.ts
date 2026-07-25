import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { runMigrations } from './prisma/run-migrations';

function deployMeta() {
  return {
    ok: true as const,
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RAILWAY_GIT_COMMIT ||
      process.env.GIT_COMMIT ||
      'unknown',
  };
}

function resolveWebDist(): string | null {
  const candidates = [
    process.env.WEB_DIST,
    join(__dirname, '..', '..', 'web', 'dist'),
    join(process.cwd(), 'apps', 'web', 'dist'),
    join(process.cwd(), 'web', 'dist'),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

const API_PREFIXES = [
  '/parcels',
  '/leads',
  '/admin',
  '/dashboard',
  '/events',
  '/agents',
  '/reports',
  '/health',
];

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL is not set — refusing to start');
    process.exit(1);
  }
  if (
    !process.env.REDIS_URL &&
    !process.env.REDIS_PRIVATE_URL &&
    !process.env.REDISHOST &&
    !process.env.REDIS_HOST
  ) {
    logger.warn(
      'No Redis env vars set — falling back to redis://localhost:6379 (will fail on Railway)',
    );
  }

  // Ensure schema exists even if the container start command skipped the entrypoint.
  try {
    runMigrations();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Prisma migrate deploy failed: ${message}`);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Always-available health probe (JSON), before static/SPA.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && req.path === '/health') {
      res.status(200).json(deployMeta());
      return;
    }
    next();
  });

  // Prevent browsers/CDNs from caching authenticated API 401/200 responses.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (API_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const webDist = resolveWebDist();
  if (webDist) {
    logger.log(`Serving web UI from ${webDist}`);
    app.useStaticAssets(webDist, { index: false });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      if (API_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
        next();
        return;
      }
      if (req.path.includes('.')) {
        next();
        return;
      }
      res.sendFile(join(webDist, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  } else {
    logger.warn('Web dist not found — API-only mode');
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && (req.path === '/' || req.path === '')) {
        res.status(200).json({
          ...deployMeta(),
          service: 'greenville-cre-lead-engine',
          docs: 'UI not bundled. Authenticated API: /parcels, /admin, /leads',
        });
        return;
      }
      next();
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`CRE Lead Engine listening on 0.0.0.0:${port}`);
  logger.log(`Deploy commit=${deployMeta().commit}`);
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  Logger.error(`Fatal bootstrap error: ${message}`, 'Bootstrap');
  process.exit(1);
});
