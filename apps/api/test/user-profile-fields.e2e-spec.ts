import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertE2eDatabase } from './e2e-database';

// Issue #72: миграция добавляет пользователю необязательные name и avatarUrl.
// Тест фиксирует контракт: у того, кто их не задавал, оба поля пусты (null),
// а заданные значения сохраняются и читаются обратно.
describe('User profile fields (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const credentials = {
    email: 'profile-fields@example.com',
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
    assertE2eDatabase();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('leaves name and avatarUrl empty for a freshly registered user', async () => {
    await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(201);

    const stored = await prisma.user.findUnique({ where: { email: credentials.email } });
    expect(stored).not.toBeNull();
    expect(stored?.name).toBeNull();
    expect(stored?.avatarUrl).toBeNull();
  });

  it('persists name and avatarUrl when set', async () => {
    await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(201);

    await prisma.user.update({
      where: { email: credentials.email },
      data: { name: 'Богдан', avatarUrl: 'a1b2c3d4.png' },
    });

    const stored = await prisma.user.findUnique({ where: { email: credentials.email } });
    expect(stored?.name).toBe('Богдан');
    expect(stored?.avatarUrl).toBe('a1b2c3d4.png');
  });
});
