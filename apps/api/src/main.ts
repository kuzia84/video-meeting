import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  // Restrict CORS to an explicit allowlist rather than reflecting every
  // origin. Configure via CORS_ORIGINS (comma-separated); defaults to the
  // local web app origin.
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Trigger module lifecycle hooks (e.g. PrismaService.onModuleDestroy →
  // $disconnect) on process termination signals (SIGTERM/SIGINT), not only
  // on an explicit app.close().
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
  console.log(`API running on: ${await app.getUrl()}`);
}

bootstrap();
