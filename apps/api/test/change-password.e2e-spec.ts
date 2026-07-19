import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertE2eDatabase } from './e2e-database';

// Issue #96: защищённый эндпоинт POST /auth/change-password — 204 при успехе, 400 на
// неверный текущий/слабый новый пароль, 401 без токена.
describe('Password change endpoint (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const credentials = { email: 'change-pw@example.com', password: 'OldPassword1!' };

  async function registerAndGetToken(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(credentials)
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function login(password: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password });
    return res.status;
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

  it('changes the password (204) so it actually takes effect', async () => {
    const token = await registerAndGetToken();

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: credentials.password, newPassword: 'NewPassword2!' })
      .expect(204);

    // Proof it was not a no-op: the new password now logs in.
    expect(await login('NewPassword2!')).toBe(200);
  });

  it('rejects a wrong current password with 400 and leaves the password unchanged', async () => {
    const token = await registerAndGetToken();

    const res = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'NotMyPassword!', newPassword: 'NewPassword2!' })
      .expect(400);
    expect(res.body.message).toBe('Неверный текущий пароль');
    expect(res.body.field).toBe('currentPassword');

    // Unchanged: the original still logs in, the rejected new one does not.
    expect(await login(credentials.password)).toBe(200);
    expect(await login('NewPassword2!')).toBe(401);
  });

  it('rejects a new password that fails the registration rules with 400', async () => {
    const token = await registerAndGetToken();

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: credentials.password, newPassword: 'short' })
      .expect(400);

    // The weak change did not take effect.
    expect(await login(credentials.password)).toBe(200);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({ currentPassword: credentials.password, newPassword: 'NewPassword2!' })
      .expect(401);
  });
});
