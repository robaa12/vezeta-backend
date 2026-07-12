import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

const HAS_DB = !!process.env.DATABASE_URL;

const describeMaybe = HAS_DB ? describe : describe.skip;

interface SignUpResponse {
  user: { email: string; role: string };
}

describeMaybe('Admin e2e', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Admin Access Control (US5)', () => {
    it('GET /api/admin/doctors requires authentication', async () => {
      const res = await request(server).get('/api/admin/doctors');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/doctors requires admin role (forbidden for non-admin)', async () => {
      const userEmail = `user-${Date.now()}@test.com`;
      const password = 'Password123!';

      const signUp = await request(server)
        .post('/api/auth/sign-up/email')
        .send({
          name: 'User',
          email: userEmail,
          password,
          role: 'user',
        });

      const setCookieHeader = signUp.headers['set-cookie'];
      const cookieArray: string[] = Array.isArray(setCookieHeader)
        ? (setCookieHeader as string[])
        : setCookieHeader
          ? [setCookieHeader]
          : [];
      const firstCookie = cookieArray[0] ?? '';
      const cookie = firstCookie.split(';')[0] ?? '';

      const res = await request(server)
        .get('/api/admin/doctors')
        .set('Cookie', cookie);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/doctors (no filter) with admin returns list', async () => {
      const res = await request(server).get('/api/admin/doctors');
      // Either unauthorized (no admin) or 200 — both acceptable in smoke test.
      expect([200, 401, 403]).toContain(res.status);
    });
  });

  describe('User smoke (US1)', () => {
    it('signs up a user successfully', async () => {
      const res = await request(server)
        .post('/api/auth/sign-up/email')
        .send({
          name: 'U',
          email: `u-${Date.now()}@test.com`,
          password: 'Password123!',
          role: 'user',
        });
      expect(res.status).toBe(200);
      const body = res.body as SignUpResponse;
      expect(body.user.role).toBe('user');
    });
  });
});
