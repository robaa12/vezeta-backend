import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

const HAS_DB = !!process.env.DATABASE_URL;

const describeMaybe = HAS_DB ? describe : describe.skip;

interface SignUpResponse {
  user: { email: string; role: string; emailVerified: boolean };
}

interface AdminPingResponse {
  pong: true;
}

interface ApiResponse {
  status?: string;
  user?: { email?: string; role?: string; emailVerified?: boolean };
  pong?: boolean;
}

describeMaybe('Auth e2e', () => {
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

  describe('Health', () => {
    it('GET /api/health returns ok', async () => {
      const res = await request(server).get('/api/health');
      expect(res.status).toBe(200);
      const body = res.body as { status: string };
      expect(body.status).toBe('ok');
    });
  });

  describe('User Registration & Verification (US1)', () => {
    const email = `user-${Date.now()}@test.com`;
    const password = 'Password123!';
    const name = 'Test User';

    it('POST /api/auth/sign-up/email creates a user and returns session', async () => {
      const res = await request(server)
        .post('/api/auth/sign-up/email')
        .send({ name, email, password, role: 'user' });

      expect(res.status).toBe(200);
      const body = res.body as SignUpResponse;
      expect(body.user.email).toBe(email);
      expect(body.user.role).toBe('user');
      expect(body.user.emailVerified).toBe(false);
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('strips role on sign-up: "admin" is never honoured', async () => {
      const res = await request(server)
        .post('/api/auth/sign-up/email')
        .send({
          name: 'Hacker',
          email: `hacker-${Date.now()}@test.com`,
          password,
          role: 'admin',
        });
      expect(res.status).toBe(200);
      const body = res.body as SignUpResponse;
      expect(body.user.role).toBe('user');
    });

    it('strips role on sign-up: "doctor" is never honoured', async () => {
      const res = await request(server)
        .post('/api/auth/sign-up/email')
        .send({
          name: 'Sneaky',
          email: `sneaky-${Date.now()}@test.com`,
          password,
          role: 'doctor',
        });
      expect(res.status).toBe(200);
      const body = res.body as SignUpResponse;
      expect(body.user.role).toBe('user');
    });

    it('rejects duplicate email', async () => {
      const res = await request(server)
        .post('/api/auth/sign-up/email')
        .send({ name, email, password, role: 'user' });
      expect(res.status).toBe(409);
    });

    it('POST /api/auth/email-otp/send-verification-otp sends OTP', async () => {
      const res = await request(server)
        .post('/api/auth/email-otp/send-verification-otp')
        .send({ email, type: 'email-verification' });
      expect(res.status).toBe(200);
    });

    it('POST /api/auth/sign-in/email returns invalid credentials for bad password', async () => {
      const res = await request(server)
        .post('/api/auth/sign-in/email')
        .send({ email, password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });
  });

  describe('Login & Session (US3)', () => {
    it('GET /api/me without cookie returns 401', async () => {
      const res = await request(server).get('/api/me');
      expect(res.status).toBe(401);
    });
  });

  describe('DoctorProfile gone (US3 regression)', () => {
    it('GET /api/doctors/test-route returns 404', async () => {
      const res = await request(server).get('/api/doctors/test-route');
      expect(res.status).toBe(404);
    });
  });

  describe('Password Reset (US4)', () => {
    it('POST /api/auth/email-otp/request-password-reset returns 200 even for unknown email', async () => {
      const res = await request(server)
        .post('/api/auth/email-otp/request-password-reset')
        .send({ email: 'nobody@nowhere.test' });
      expect(res.status).toBe(200);
    });
  });

  describe('Admin Endpoints (US5)', () => {
    it('GET /api/admin/doctors without admin role returns 401', async () => {
      const res = await request(server).get('/api/admin/doctors');
      expect(res.status).toBeGreaterThanOrEqual(401);
    });

    it('GET /api/admin/ping is anonymous-ok', async () => {
      const res = await request(server).get('/api/admin/ping');
      expect(res.status).toBe(200);
      const body = res.body as AdminPingResponse;
      expect(body.pong).toBe(true);
    });

    it('smoke: rejects malformed sign-up body via validation pipe', async () => {
      const res = await request(server)
        .post('/api/auth/sign-up/email')
        .send({ name: 'X' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('smoke: returns ApiResponse-shape for unknown auth route', async () => {
      const res = await request(server).get('/api/auth/unknown-route');
      expect([404, 405]).toContain(res.status);
      const body = res.body as ApiResponse;
      expect(typeof body).toBe('object');
    });
  });
});
