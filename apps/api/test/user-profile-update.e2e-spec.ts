import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertE2eDatabase } from './e2e-database';

// Issue #81: команда обновления имени в модуле Users и эндпоинт правки профиля
// PATCH /users/me с валидацией имени. Сохранённое имя видно в профиле, а цвет
// дефолтного аватара при смене имени не меняется.
describe('Profile name update endpoint (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const credentials = {
    email: 'profile-edit@example.com',
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

  it('stores the new name and returns the updated profile', async () => {
    const token = await registerAndGetToken();

    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Богдан' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Богдан');

    // The change is persisted — a fresh GET sees it too.
    const after = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.data.name).toBe('Богдан');
  });

  it('leaves the default-avatar colour untouched when the name changes', async () => {
    const token = await registerAndGetToken();
    const before = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const colour = before.body.data.avatarColor as string;

    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ада' })
      .expect(200);

    expect(res.body.data.avatarColor).toBe(colour);
  });

  it('trims surrounding whitespace before storing the name', async () => {
    const token = await registerAndGetToken();

    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '  Богдан  ' })
      .expect(200);

    expect(res.body.data.name).toBe('Богдан');
  });

  it('rejects a name that is empty once trimmed with 400', async () => {
    const token = await registerAndGetToken();

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' })
      .expect(400);
  });

  it('rejects a missing name with 400', async () => {
    const token = await registerAndGetToken();

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('rejects a name longer than 100 characters with 400', async () => {
    const token = await registerAndGetToken();

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'я'.repeat(101) })
      .expect(400);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer()).patch('/users/me').send({ name: 'Богдан' }).expect(401);
  });
});
