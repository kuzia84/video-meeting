import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertE2eDatabase } from './e2e-database';

// Issue #73: защищённый эндпоинт профиля GET /users/me отдаёт id, email, имя и
// ссылку на аватар текущего (по JWT) пользователя. Без токена — 401.
describe('User profile endpoint (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const credentials = {
    email: 'profile-me@example.com',
    password: 'password123',
  };

  async function registerAndGetToken(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(credentials)
      .expect(201);
    return res.body.data.accessToken as string;
  }

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
    assertE2eDatabase();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the current user profile with empty name and avatarUrl by default', async () => {
    const token = await registerAndGetToken();

    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(credentials.email);
    expect(typeof res.body.data.id).toBe('string');
    expect(res.body.data.name).toBeNull();
    expect(res.body.data.avatarUrl).toBeNull();
    // The password hash must never leak over HTTP.
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('reflects a stored name and avatarUrl', async () => {
    const token = await registerAndGetToken();
    await prisma.user.update({
      where: { email: credentials.email },
      data: { name: 'Богдан', avatarUrl: 'a1b2c3d4.png' },
    });

    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.name).toBe('Богдан');
    expect(res.body.data.avatarUrl).toBe('a1b2c3d4.png');
  });

  it('rejects a request without a token with 401', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('rejects a request with a malformed token with 401', async () => {
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });
});
