import { mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeetingFileStorage } from './meeting-file-storage.service';
import { UPLOAD_DIR } from './storage.constants';

// Multer does not create its destination, so the directory is made once at startup.
export function resolveUploadDir(config: ConfigService): string {
  const configured = config.get<string>('UPLOAD_DIR')?.trim();
  const dir = configured
    ? isAbsolute(configured)
      ? configured
      : join(process.cwd(), configured)
    : join(process.cwd(), 'uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}

@Global()
@Module({
  providers: [
    {
      provide: UPLOAD_DIR,
      inject: [ConfigService],
      useFactory: resolveUploadDir,
    },
    MeetingFileStorage,
  ],
  exports: [UPLOAD_DIR, MeetingFileStorage],
})
export class StorageModule {}
