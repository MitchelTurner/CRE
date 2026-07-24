import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL is not set — refusing to start');
    process.exit(1);
  }
  if (!process.env.REDIS_URL && !process.env.REDIS_PRIVATE_URL) {
    logger.warn(
      'REDIS_URL/REDIS_PRIVATE_URL not set — falling back to redis://localhost:6379 (will fail on Railway)',
    );
  }

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Railway / container healthchecks need a non-loopback bind.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`CRE Lead Engine listening on 0.0.0.0:${port}`);
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', message);
  process.exit(1);
});