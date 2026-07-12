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

  describe('US1 — Public slot listing', () => {
    let testDoctorId: string;
    let testCategoryId: string;
    const createdSlotIds: string[] = [];

    beforeAll(async () => {
      // Use the seeded seed_cardiology category and create a fresh doctor
      const cat = await prisma.category.findUnique({
        where: { id: 'seed_cardiology' },
      });
      if (!cat) throw new Error('seed_cardiology missing — run db:seed');
      testCategoryId = cat.id;
      const doctor = await prisma.doctor.create({
        data: {
          name: `Dr. US1 Test ${Date.now()}`,
          categoryId: testCategoryId,
          status: 'ACTIVE',
        },
      });
      testDoctorId = doctor.id;
    });

    afterAll(async () => {
      if (createdSlotIds.length) {
        await prisma.doctorSlot.deleteMany({
          where: { id: { in: createdSlotIds } },
        });
      }
      await prisma.doctor.deleteMany({ where: { id: testDoctorId } });
    });

    it('returns 200 without any auth header (anonymous) and Cache-Control: max-age=60', async () => {
      const res = await request(server).get(
        `/api/doctors/${testDoctorId}/slots`,
      );
      expect(res.status).toBe(200);
      const body = res.body as {
        slots: Array<{ id: string; startsAt: string; status: string }>;
      };
      expect(Array.isArray(body.slots)).toBe(true);
      expect(res.headers['cache-control']).toMatch(/max-age=60/);
    });

    it('returns 404 for a non-existent doctor', async () => {
      const res = await request(server).get(
        '/api/doctors/doctor_definitely_does_not_exist/slots',
      );
      expect(res.status).toBe(404);
    });

    it('returns only AVAILABLE slots (excludes BOOKED and BLOCKED)', async () => {
      // Create one AVAILABLE, one BLOCKED slot
      const now = Date.now();
      const av = await prisma.doctorSlot.create({
        data: {
          doctorId: testDoctorId,
          startsAt: new Date(now + 3600_000),
          endsAt: new Date(now + 3600_000 + 1800_000),
          status: 'AVAILABLE',
        },
      });
      const bl = await prisma.doctorSlot.create({
        data: {
          doctorId: testDoctorId,
          startsAt: new Date(now + 7200_000),
          endsAt: new Date(now + 7200_000 + 1800_000),
          status: 'BLOCKED',
        },
      });
      createdSlotIds.push(av.id, bl.id);

      const res = await request(server).get(
        `/api/doctors/${testDoctorId}/slots`,
      );
      const body = res.body as { slots: Array<{ id: string; status: string }> };
      const ids = body.slots.map((s) => s.id);
      expect(ids).toContain(av.id);
      expect(ids).not.toContain(bl.id);
      body.slots.forEach((s) => expect(s.status).toBe('AVAILABLE'));
    });

    it('returns 404 for a doctor whose category is DEACTIVATED', async () => {
      // Create a separate doctor under a freshly created (then deactivated) category
      const deactCat = await prisma.category.create({
        data: { name: `US1-Deact-${Date.now()}`, status: 'DEACTIVATED' },
      });
      const doc = await prisma.doctor.create({
        data: {
          name: `Dr. US1 Hidden ${Date.now()}`,
          categoryId: deactCat.id,
          status: 'ACTIVE',
        },
      });

      const res = await request(server).get(`/api/doctors/${doc.id}/slots`);
      expect(res.status).toBe(404);

      // Cleanup
      await prisma.doctor.deleteMany({ where: { id: doc.id } });
      await prisma.category.deleteMany({ where: { id: deactCat.id } });
    });

    it('returns 404 for a DEACTIVATED doctor', async () => {
      const deactDoc = await prisma.doctor.create({
        data: {
          name: `Dr. US1 Deact ${Date.now()}`,
          categoryId: testCategoryId,
          status: 'DEACTIVATED',
        },
      });

      const res = await request(server).get(
        `/api/doctors/${deactDoc.id}/slots`,
      );
      expect(res.status).toBe(404);

      // Cleanup
      await prisma.doctor.deleteMany({ where: { id: deactDoc.id } });
    });

    it('returns slots sorted ascending by startsAt', async () => {
      const now = Date.now();
      const later = await prisma.doctorSlot.create({
        data: {
          doctorId: testDoctorId,
          startsAt: new Date(now + 4 * 3600_000),
          endsAt: new Date(now + 4 * 3600_000 + 1800_000),
          status: 'AVAILABLE',
        },
      });
      const earlier = await prisma.doctorSlot.create({
        data: {
          doctorId: testDoctorId,
          startsAt: new Date(now + 2 * 3600_000),
          endsAt: new Date(now + 2 * 3600_000 + 1800_000),
          status: 'AVAILABLE',
        },
      });
      createdSlotIds.push(later.id, earlier.id);

      const res = await request(server).get(
        `/api/doctors/${testDoctorId}/slots`,
      );
      const body = res.body as {
        slots: Array<{ id: string; startsAt: string }>;
      };
      const idxLater = body.slots.findIndex((s) => s.id === later.id);
      const idxEarlier = body.slots.findIndex((s) => s.id === earlier.id);
      expect(idxEarlier).toBeGreaterThanOrEqual(0);
      expect(idxLater).toBeGreaterThanOrEqual(0);
      expect(idxEarlier).toBeLessThan(idxLater);
    });
  });
});

// Helper exports for use by other test files in this suite
export { signIn, getAdminSession, getPatientSession };
export type { AdminSession, PatientSession };
