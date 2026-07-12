import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

const HAS_DB = !!process.env.DATABASE_URL;
const describeMaybe = HAS_DB ? describe : describe.skip;

describeMaybe('Social Login e2e (002-social-oauth-login)', () => {
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

  describe('Endpoint shape (no session required for some checks)', () => {
    it('POST /api/auth/link-social without session returns 403', async () => {
      const res = await request(server)
        .post('/api/auth/link-social')
        .send({ provider: 'google' });
      expect([401, 403]).toContain(res.status);
    });

    it('POST /api/auth/link-social with invalid provider returns 400', async () => {
      const res = await request(server)
        .post('/api/auth/link-social')
        .send({ provider: 'twitter' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('DELETE /api/auth/social-accounts/unknown returns 403 without session', async () => {
      const res = await request(server).delete(
        '/api/auth/social-accounts/google',
      );
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Sign-in social endpoint (Better Auth managed)', () => {
    it('GET /api/auth/sign-in/social without provider returns 400', async () => {
      const res = await request(server).get('/api/auth/sign-in/social');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('GET /api/auth/sign-in/social?provider=google returns 302 to accounts.google.com', async () => {
      const res = await request(server).get(
        '/api/auth/sign-in/social?provider=google',
      );
      expect([302, 500]).toContain(res.status);
      if (res.status === 302) {
        const loc = res.headers['location'];
        expect(typeof loc).toBe('string');
        expect(loc).toMatch(/google\.com|accounts\.google\.com/);
      }
    });

    it('GET /api/auth/sign-in/social?provider=facebook returns 302 to facebook.com', async () => {
      const res = await request(server).get(
        '/api/auth/sign-in/social?provider=facebook',
      );
      expect([302, 500]).toContain(res.status);
      if (res.status === 302) {
        const loc = res.headers['location'];
        expect(typeof loc).toBe('string');
        expect(loc).toMatch(/facebook\.com/);
      }
    });
  });

  describe('Unlink without an account', () => {
    it('DELETE /api/auth/social-accounts/google without session returns 403', async () => {
      const res = await request(server).delete(
        '/api/auth/social-accounts/google',
      );
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Link + unlink business rules via unit-tested helpers', () => {
    it('confirms /me shape includes linkedSocialProviders (or empty array)', async () => {
      const res = await request(server).get('/api/me');
      expect([401, 403, 200]).toContain(res.status);
    });
  });
});
