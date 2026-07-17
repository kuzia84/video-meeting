import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertE2eDatabase } from './e2e-database';

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const validCredentials = {
    email: 'user@example.com',
    password: 'password123',
  };

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
    // This suite deletes every user it can see — never let that be the dev database.
    assertE2eDatabase();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('creates a user and returns a JWT + user data', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validCredentials)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.accessToken.length).toBeGreaterThan(0);
      expect(res.body.data.user.email).toBe(validCredentials.email);
      expect(typeof res.body.data.user.id).toBe('string');

      const stored = await prisma.user.findUnique({
        where: { email: validCredentials.email },
      });
      expect(stored).not.toBeNull();
      expect(stored?.passwordHash).not.toBe(validCredentials.password);
    });

    it('rejects a duplicate email with 409 and identifies the conflicting field', async () => {
      await request(app.getHttpServer()).post('/auth/register').send(validCredentials).expect(201);
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validCredentials)
        .expect(409);
      expect(res.body.field).toBe('email');
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('rejects a password shorter than 8 chars with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'short' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/auth/register').send(validCredentials).expect(201);
    });

    it('returns a JWT + user data for correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(validCredentials)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.user.email).toBe(validCredentials.email);
    });

    it('rejects a wrong password with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: validCredentials.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('rejects an unknown email with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);
    });
  });

  describe('email normalization & password length', () => {
    it('normalizes email so login is case-insensitive', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'Mixed@Example.com', password: 'password123' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'mixed@example.com', password: 'password123' })
        .expect(200);
    });

    it('treats case-variant emails as the same account (409 on duplicate)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'Dup@Example.com', password: 'password123' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'dup@example.com', password: 'password123' })
        .expect(409);
    });

    it('rejects a password longer than 72 chars with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'long@example.com', password: 'a'.repeat(73) })
        .expect(400);
    });
  });

  it('issues a token whose payload sub matches the user id', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(validCredentials)
      .expect(201);

    const payload = decodeJwtPayload(res.body.data.accessToken);
    expect(payload.sub).toBe(res.body.data.user.id);
  });
});
