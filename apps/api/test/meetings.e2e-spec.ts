import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface RegisteredUser {
  token: string;
  userId: string;
}

describe('Meetings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let counter = 0;
  async function registerUser(): Promise<RegisteredUser> {
    counter += 1;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `user${counter}@example.com`, password: 'password123' })
      .expect(201);
    return { token: res.body.data.accessToken, userId: res.body.data.user.id };
  }

  const validMeeting = () => ({
    title: 'Standup',
    description: 'Daily sync',
    startTime: '2026-08-01T10:00:00.000Z',
    endTime: '2026-08-01T10:30:00.000Z',
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    await prisma.meeting.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /meetings', () => {
    it('creates a meeting owned by the current user', async () => {
      const { token, userId } = await registerUser();

      const res = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${token}`)
        .send(validMeeting())
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.id).toBe('string');
      expect(res.body.data.title).toBe('Standup');
      expect(res.body.data.userId).toBe(userId);
      expect(new Date(res.body.data.endTime).getTime()).toBeGreaterThan(
        new Date(res.body.data.startTime).getTime(),
      );
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).post('/meetings').send(validMeeting()).expect(401);
    });

    it('rejects a missing title with 400', async () => {
      const { token } = await registerUser();
      const { description, startTime, endTime } = validMeeting();
      const noTitle = { description, startTime, endTime };
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${token}`)
        .send(noTitle)
        .expect(400);
    });

    it('rejects a non-date startTime with 400', async () => {
      const { token } = await registerUser();
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validMeeting(), startTime: 'not-a-date' })
        .expect(400);
    });

    it('rejects endTime not after startTime with 400', async () => {
      const { token } = await registerUser();
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validMeeting(),
          startTime: '2026-08-01T10:30:00.000Z',
          endTime: '2026-08-01T10:00:00.000Z',
        })
        .expect(400);
    });
  });

  describe('GET /meetings', () => {
    it('returns only the current user’s meetings, paginated', async () => {
      const a = await registerUser();
      const b = await registerUser();

      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${a.token}`)
        .send(validMeeting())
        .expect(201);
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${b.token}`)
        .send(validMeeting())
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${a.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
      expect(res.body.data[0].userId).toBe(a.userId);
    });

    it('honours page and limit', async () => {
      const { token } = await registerUser();
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post('/meetings')
          .set('Authorization', `Bearer ${token}`)
          .send({ ...validMeeting(), title: `M${i}` })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/meetings?page=1&limit=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.limit).toBe(2);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get('/meetings').expect(401);
    });

    it('pages over meetings that share a startTime without repeating or losing any', async () => {
      const { token } = await registerUser();
      // Same slot for every one of them: recurring meetings, or a bulk import. Without a
      // tie-breaker in the ORDER BY, Postgres may order these differently per query, and
      // skip/take then hands the same row to two pages while another is never returned.
      const sameStart = '2026-08-01T10:00:00.000Z';
      for (let i = 0; i < 25; i += 1) {
        await request(app.getHttpServer())
          .post('/meetings')
          .set('Authorization', `Bearer ${token}`)
          .send({
            title: `Tied ${i}`,
            startTime: sameStart,
            endTime: '2026-08-01T10:30:00.000Z',
          })
          .expect(201);
      }

      const seen: string[] = [];
      for (let page = 1; page <= 5; page += 1) {
        const res = await request(app.getHttpServer())
          .get(`/meetings?page=${page}&limit=5`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        seen.push(...res.body.data.map((m: { id: string }) => m.id));
      }

      expect(seen).toHaveLength(25);
      expect(new Set(seen).size).toBe(25);
    });
  });

  describe('GET /meetings/:id', () => {
    it('returns the current user’s meeting', async () => {
      const { token } = await registerUser();
      const created = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${token}`)
        .send(validMeeting())
        .expect(201);
      const id = created.body.data.id;

      const res = await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
    });

    it('returns 404 for another user’s meeting', async () => {
      const a = await registerUser();
      const b = await registerUser();
      const created = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${b.token}`)
        .send(validMeeting())
        .expect(201);

      await request(app.getHttpServer())
        .get(`/meetings/${created.body.data.id}`)
        .set('Authorization', `Bearer ${a.token}`)
        .expect(404);
    });

    it('returns 404 for a non-existent meeting', async () => {
      const { token } = await registerUser();
      await request(app.getHttpServer())
        .get('/meetings/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/meetings/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });
  });
});
