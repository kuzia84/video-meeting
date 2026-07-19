import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'superagent';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UPLOAD_DIR } from '../src/storage/storage.constants';
import { AVATAR_SUBDIR } from '../src/users/avatar/avatar-storage.service';
import { assertE2eDatabase } from './e2e-database';
import './setup-e2e';

// Minimal payloads: the content check sniffs only the leading bytes, so a real signature
// plus padding is enough to be accepted (PNG) or rejected (PDF wearing a .png name).
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(64),
]);
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n', 'ascii'), Buffer.alloc(64)]);

// Each accepted format: [label, bytes, filename, sent mimetype, expected served type].
const FORMATS: [string, Buffer, string, string, string][] = [
  ['JPEG', JPEG_BYTES, 'me.jpg', 'image/jpeg', 'image/jpeg'],
  ['PNG', PNG_BYTES, 'me.png', 'image/png', 'image/png'],
  ['WebP', WEBP_BYTES, 'me.webp', 'image/webp', 'image/webp'],
];

/** supertest parses no body for an image content type; collect the raw bytes instead. */
function binaryParser(res: Response, cb: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
  res.on('error', (err: Error) => cb(err, Buffer.alloc(0)));
}

describe('Avatar upload (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let avatarDir: string;

  let counter = 0;
  async function registerUser(): Promise<string> {
    counter += 1;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `avatar${counter}@example.com`, password: 'password123' })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function getAvatarUrl(token: string): Promise<string | null> {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data.avatarUrl as string | null;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    prisma = moduleFixture.get(PrismaService);
    avatarDir = join(moduleFixture.get<string>(UPLOAD_DIR), AVATAR_SUBDIR);
    await app.init();
  });

  beforeEach(async () => {
    assertE2eDatabase();
    await prisma.user.deleteMany();
    // Start each test from an empty avatars directory so file counts are meaningful.
    await rm(avatarDir, { recursive: true, force: true });
    await mkdir(avatarDir, { recursive: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(FORMATS)(
    'accepts a %s up to 5 MB, stores it and serves it back with the right content type',
    async (_label, bytes, filename, mimeType, servedType) => {
      const token = await registerUser();

      const res = await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', bytes, { filename, contentType: mimeType })
        .expect(201);

      const stored = res.body.data.avatarUrl as string;
      expect(stored).toBeTruthy();
      expect(await readdir(avatarDir)).toEqual([stored]);

      const served = await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .buffer()
        .parse(binaryParser)
        .expect(200);
      expect(served.headers['content-type']).toContain(servedType);
      expect(served.body).toEqual(bytes);
    },
  );

  it('rejects a file larger than 5 MB with a message naming the limit, leaving the previous avatar', async () => {
    const token = await registerUser();
    const first = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const stored = first.body.data.avatarUrl as string;

    // A PNG-headed buffer past the 5 MB cap: the filter passes on the header, the size
    // limit tears the stream down mid-write.
    const tooBig = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(5 * 1024 * 1024 + 16),
    ]);
    const res = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', tooBig, { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
    expect(res.body.message).toContain('5 МБ');

    // The previous avatar is untouched, and the oversized upload left nothing behind.
    expect(await getAvatarUrl(token)).toBe(stored);
    expect(await readdir(avatarDir)).toEqual([stored]);
  });

  it('rejects an unsupported format by extension with a message, leaving the previous avatar', async () => {
    const token = await registerUser();
    const first = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const stored = first.body.data.avatarUrl as string;

    const res = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', PDF_BYTES, { filename: 'doc.pdf', contentType: 'application/pdf' })
      .expect(400);
    expect(res.body.message).toMatch(/JPEG.*PNG.*WebP/i);

    expect(await getAvatarUrl(token)).toBe(stored);
    expect(await readdir(avatarDir)).toEqual([stored]);
  });

  it('accepts a PNG, stores it and points the user at it', async () => {
    const token = await registerUser();
    expect(await getAvatarUrl(token)).toBeNull();

    const res = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', PNG_BYTES, { filename: 'me.png', contentType: 'image/png' })
      .expect(201);

    const stored = res.body.data.avatarUrl as string;
    expect(stored).toBeTruthy();
    // The link the profile returns matches the one file now on disk.
    expect(await getAvatarUrl(token)).toBe(stored);
    expect(await readdir(avatarDir)).toEqual([stored]);
  });

  it('replaces a previous avatar: new link, and the old bytes are gone from disk', async () => {
    const token = await registerUser();

    const first = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const firstStored = first.body.data.avatarUrl as string;

    const second = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', PNG_BYTES, { filename: 'b.png', contentType: 'image/png' })
      .expect(201);
    const secondStored = second.body.data.avatarUrl as string;

    expect(secondStored).not.toBe(firstStored);
    expect(await getAvatarUrl(token)).toBe(secondStored);
    // Exactly the new file remains; the previous one was reclaimed.
    expect(await readdir(avatarDir)).toEqual([secondStored]);
  });

  it('rejects a PDF renamed to .png and leaves the previous avatar untouched', async () => {
    const token = await registerUser();
    const first = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const stored = first.body.data.avatarUrl as string;

    const res = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', PDF_BYTES, { filename: 'evil.png', contentType: 'image/png' })
      .expect(400);
    expect(res.body.message).toMatch(/изображени/i);

    // The link still points at the original, and only the original file is on disk (the
    // rejected upload was cleaned up, not left behind).
    expect(await getAvatarUrl(token)).toBe(stored);
    expect(await readdir(avatarDir)).toEqual([stored]);
  });

  describe('serving the avatar back', () => {
    it('streams the uploaded bytes with the sniffed content type', async () => {
      const token = await registerUser();
      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', PNG_BYTES, { filename: 'me.png', contentType: 'image/png' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .buffer()
        .parse(binaryParser)
        .expect(200);

      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private, no-cache');
      expect(res.body).toEqual(PNG_BYTES);
    });

    it('401s for a valid token whose account was since deleted', async () => {
      const token = await registerUser();
      await prisma.user.deleteMany();

      await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('404s when the user has no avatar', async () => {
      const token = await registerUser();
      await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('401s without a token — the avatar is not public', async () => {
      await request(app.getHttpServer()).get('/users/me/avatar').expect(401);
    });
  });
});
