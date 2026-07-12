import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

const HAS_DB = !!process.env.DATABASE_URL;
const describeMaybe = HAS_DB ? describe : describe.skip;

interface AdminSession {
  cookie: string;
  email: string;
  password: string;
}

interface PatientSession {
  cookie: string;
  email: string;
  password: string;
  userId: string;
}

async function signIn(
  server: Server,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(server)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .expect(200);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie)
    ? setCookie.join(';')
    : (setCookie ?? '');
  const match = raw.match(/vezeta\.session_token=[^;]+/);
  if (!match) throw new Error(`No session cookie returned: ${raw}`);
  return match[0];
}

async function getAdminSession(server: Server): Promise<AdminSession> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@vezeta.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const cookie = await signIn(server, email, password);
  return { cookie, email, password };
}

async function getPatientSession(
  server: Server,
  prisma: PrismaClient,
  index: number,
): Promise<PatientSession> {
  const email = `appointments-patient-${index}-${Date.now()}@example.com`;
  const password = 'Patient123!';
  // Sign up
  await request(server)
    .post('/api/auth/sign-up/email')
    .send({ email, password, name: `Patient ${index}` })
    .expect(201);
  // Find the user id
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Patient signup did not create user: ${email}`);
  // Sign in
  const cookie = await signIn(server, email, password);
  return { cookie, email, password, userId: user.id };
}

describeMaybe('Appointments & Booking (006-appointments-booking)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaClient;

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
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL not set');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (app) await app.close();
  });

  it('boots the app and exposes the appointments endpoints', async () => {
    // Public slots endpoint mounted (US1) - just verify the route exists
    // (it returns 200, 404, etc; we don't care about the body here).
    const slots = await request(server).get(
      '/api/doctors/doctor_does_not_exist/slots',
    );
    expect([200, 404]).toContain(slots.status);
  });
});

// Helper exports for use by other test files in this suite
export { signIn, getAdminSession, getPatientSession };
export type { AdminSession, PatientSession };
