import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

const SERVICE_NAME = 'greenville-cre-lead-engine';

function deployMeta() {
  return {
    service: SERVICE_NAME,
    ok: true as const,
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RAILWAY_GIT_COMMIT ||
      process.env.GIT_COMMIT ||
      'unknown',
    health: '/health',
  };
}

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

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Express-level handlers registered first so `/` and `/health` always work,
  // even if a Nest controller fails to register.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      next();
      return;
    }
    const path = req.path || '/';
    if (path === '/' || path === '') {
      res.status(200).json({
        ...deployMeta(),
        docs: 'Authenticated API: /parcels, /admin/sync, /admin/digest/preview (Bearer API_TOKEN)',
      });
      return;
    }
    if (path === '/health') {
      res.status(200).json({ ok: true, commit: deployMeta().commit });
      return;
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

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
