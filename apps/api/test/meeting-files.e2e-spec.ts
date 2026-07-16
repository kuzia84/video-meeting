import { mkdir, readdir, readFile, rm, truncate } from 'node:fs/promises';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'superagent';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UPLOAD_DIR } from '../src/storage/storage.constants';
// Load-bearing beyond the constant: importing setup-e2e sets UPLOAD_DIR to the isolated
// directory even if this suite is ever run through a config without its `setupFiles`.
// This matters — the suite wipes that directory between tests.
import { ISOLATED_UPLOAD_DIR_NAME } from './setup-e2e';

interface RegisteredUser {
  token: string;
  userId: string;
}

interface MeetingFileBody {
  id: string;
  originalName: string;
  size: number;
}

/** supertest parses no body for a binary content type; collect the raw bytes instead. */
function binaryParser(res: Response, cb: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
  res.on('error', (err: Error) => cb(err, Buffer.alloc(0)));
}

describe('Meeting files (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let uploadDir: string;

  let counter = 0;
  async function registerUser(): Promise<RegisteredUser> {
    counter += 1;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `files${counter}@example.com`, password: 'password123' })
      .expect(201);
    return { token: res.body.data.accessToken, userId: res.body.data.user.id };
  }

  async function createMeeting(token: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Standup',
        startTime: '2026-08-01T10:00:00.000Z',
        endTime: '2026-08-01T10:30:00.000Z',
      })
      .expect(201);
    return res.body.data.id;
  }

  async function filesOnDisk(): Promise<string[]> {
    return readdir(uploadDir);
  }

  /** Uploads `audio` and returns the new file's id. */
  async function upload(
    token: string,
    meetingId: string,
    { filename = 'recording.mp3' }: { filename?: string } = {},
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', audio, { filename, contentType: 'audio/mpeg' })
      .expect(201);
    return res.body.data.id;
  }

  const audio = Buffer.from('fake mp3 payload');

  /** Builds a fresh application instance — also used to prove uploads survive a restart. */
  async function startApp(): Promise<void> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    prisma = moduleFixture.get(PrismaService);
    uploadDir = moduleFixture.get<string>(UPLOAD_DIR);

    // This suite wipes uploadDir between tests, so refuse to run unless setup-e2e.ts
    // pointed it at the isolated directory — otherwise it would delete real uploads.
    if (!uploadDir.endsWith(ISOLATED_UPLOAD_DIR_NAME)) {
      throw new Error(
        `Refusing to run: UPLOAD_DIR resolved to "${uploadDir}", not the isolated ` +
          `"${ISOLATED_UPLOAD_DIR_NAME}". Is test/setup-e2e.ts wired up via setupFiles?`,
      );
    }

    await app.init();
  }

  beforeAll(startApp);

  beforeEach(async () => {
    await prisma.meeting.deleteMany();
    await prisma.user.deleteMany();
    // Empty the directory but keep it: multer does not create its destination.
    await rm(uploadDir, { recursive: true, force: true });
    await mkdir(uploadDir, { recursive: true });
  });

  afterAll(async () => {
    await app.close();
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('stores the file on disk and its metadata in the database for the owner', async () => {
    const { token } = await registerUser();
    const meetingId = await createMeeting(token);

    const res = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', audio, { filename: 'recording.mp3', contentType: 'audio/mpeg' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.id).toBe('string');
    expect(res.body.data.originalName).toBe('recording.mp3');
    expect(res.body.data.size).toBe(audio.length);
    expect(res.body.data.mimeType).toBe('audio/mpeg');
    expect(res.body.data.meetingId).toBe(meetingId);
    expect(new Date(res.body.data.createdAt).getTime()).not.toBeNaN();
    // storedName is an internal detail and must not be serialized.
    expect(res.body.data.storedName).toBeUndefined();

    const row = await prisma.meetingFile.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.meetingId).toBe(meetingId);
    expect(row.originalName).toBe('recording.mp3');

    const written = await readFile(`${uploadDir}/${row.storedName}`);
    expect(written.equals(audio)).toBe(true);
  });

  it('keeps a Cyrillic original name readable', async () => {
    const { token } = await registerUser();
    const meetingId = await createMeeting(token);

    const res = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', audio, { filename: 'Запись встречи.mp3', contentType: 'audio/mpeg' })
      .expect(201);

    expect(res.body.data.originalName).toBe('Запись встречи.mp3');
  });

  it('does not name the file on disk after the client-supplied name', async () => {
    const { token } = await registerUser();
    const meetingId = await createMeeting(token);

    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', audio, { filename: 'recording.mp3', contentType: 'audio/mpeg' })
      .expect(201);

    expect(await filesOnDisk()).not.toContain('recording.mp3');
  });

  it('returns 404 and writes nothing for another user’s meeting', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const meetingId = await createMeeting(owner.token);

    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .attach('file', audio, { filename: 'recording.mp3', contentType: 'audio/mpeg' })
      .expect(404);

    expect(await prisma.meetingFile.count()).toBe(0);
    expect(await filesOnDisk()).toHaveLength(0);
  });

  it('returns 404 for a non-existent meeting, same as for another user’s', async () => {
    const { token } = await registerUser();

    await request(app.getHttpServer())
      .post('/meetings/00000000-0000-0000-0000-000000000000/files')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', audio, { filename: 'recording.mp3', contentType: 'audio/mpeg' })
      .expect(404);

    expect(await prisma.meetingFile.count()).toBe(0);
    expect(await filesOnDisk()).toHaveLength(0);
  });

  it('returns 401 and writes nothing without a token', async () => {
    const { token } = await registerUser();
    const meetingId = await createMeeting(token);

    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .attach('file', audio, { filename: 'recording.mp3', contentType: 'audio/mpeg' })
      .expect(401);

    expect(await prisma.meetingFile.count()).toBe(0);
    expect(await filesOnDisk()).toHaveLength(0);
  });

  it('rejects a request without a file part with 400', async () => {
    const { token } = await registerUser();
    const meetingId = await createMeeting(token);

    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(await prisma.meetingFile.count()).toBe(0);
  });

  describe('GET /meetings/:meetingId/files', () => {
    it('lists the meeting’s files with their metadata', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);
      await upload(token, meetingId, { filename: 'first.mp3' });
      await upload(token, meetingId, { filename: 'second.mp3' });

      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.map((f: MeetingFileBody) => f.originalName)).toEqual([
        'first.mp3',
        'second.mp3',
      ]);
      expect(res.body.data[0].size).toBe(audio.length);
      expect(res.body.data[0].mimeType).toBe('audio/mpeg');
      expect(new Date(res.body.data[0].createdAt).getTime()).not.toBeNaN();
      expect(res.body.data[0].storedName).toBeUndefined();
    });

    it('returns an empty array for a meeting with no files', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);

      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('does not list files of another user’s meeting', async () => {
      const owner = await registerUser();
      const stranger = await registerUser();
      const meetingId = await createMeeting(owner.token);
      await upload(owner.token, meetingId);

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(404);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);

      await request(app.getHttpServer()).get(`/meetings/${meetingId}/files`).expect(401);
    });
  });

  describe('GET /meetings/:meetingId/files/:fileId', () => {
    it('streams back content identical to what was uploaded', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);
      const fileId = await upload(token, meetingId);

      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${token}`)
        .buffer()
        .parse(binaryParser)
        .expect(200);

      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect((res.body as Buffer).equals(audio)).toBe(true);
    });

    it('sends the original filename and content type', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);
      const fileId = await upload(token, meetingId, { filename: 'Запись встречи.mp3' });

      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${token}`)
        .buffer()
        .parse(binaryParser)
        .expect(200);

      // RFC 5987 — a bare filename="…" could not carry Cyrillic.
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename*=UTF-8''${encodeURIComponent('Запись встречи.mp3')}`,
      );
      expect(res.headers['content-type']).toBe('audio/mpeg');
      expect(res.headers['content-length']).toBe(String(audio.length));
    });

    it('keeps the file listable and downloadable after an application restart', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);
      const fileId = await upload(token, meetingId, { filename: 'persisted.mp3' });

      await app.close();
      await startApp();

      const list = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].originalName).toBe('persisted.mp3');

      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${token}`)
        .buffer()
        .parse(binaryParser)
        .expect(200);
      expect((res.body as Buffer).equals(audio)).toBe(true);
    });

    it('returns 404 for a file belonging to another meeting of the same user', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);
      const otherMeetingId = await createMeeting(token);
      const fileId = await upload(token, otherMeetingId);

      // The caller owns both meetings, so only the file↔meeting check can reject this.
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 404 for a non-existent file', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 404 when the row outlived its bytes on disk', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);
      const fileId = await upload(token, meetingId);

      const row = await prisma.meetingFile.findUniqueOrThrow({ where: { id: fileId } });
      await rm(`${uploadDir}/${row.storedName}`);

      // Must be a clean 404, not a 200 that truncates once the stream hits ENOENT.
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 404 when the bytes on disk no longer match the recorded size', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);
      const fileId = await upload(token, meetingId);

      const row = await prisma.meetingFile.findUniqueOrThrow({ where: { id: fileId } });
      await truncate(`${uploadDir}/${row.storedName}`, 3);

      // Streaming this would either abort the download (Content-Length promising bytes
      // the stream lacks) or hand over a silently corrupt file. Both are worse than 404.
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('sends nosniff so the declared type cannot be second-guessed', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);
      const fileId = await upload(token, meetingId);

      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${token}`)
        .buffer()
        .parse(binaryParser)
        .expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('does not hand a file to another user', async () => {
      const owner = await registerUser();
      const stranger = await registerUser();
      const meetingId = await createMeeting(owner.token);
      const fileId = await upload(owner.token, meetingId);

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(404);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const { token } = await registerUser();
      const meetingId = await createMeeting(token);
      const fileId = await upload(token, meetingId);

      await request(app.getHttpServer()).get(`/meetings/${meetingId}/files/${fileId}`).expect(401);
    });
  });
});
