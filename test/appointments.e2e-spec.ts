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
  // Sign up (Better Auth returns 200 OK on sign-up)
  await request(server)
    .post('/api/auth/sign-up/email')
    .send({ email, password, name: `Patient ${index}` });
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

  describe('US8 — Admin slot CRUD', () => {
    let admin: AdminSession;
    const createdSlotIds: string[] = [];
    const createdDoctorIds: string[] = [];

    beforeAll(async () => {
      admin = await getAdminSession(server);
    });

    afterAll(async () => {
      // Delete in dependency order: slots first, then doctors.
      if (createdSlotIds.length) {
        await prisma.doctorSlot.deleteMany({
          where: { id: { in: createdSlotIds } },
        });
      }
      if (createdDoctorIds.length) {
        await prisma.appointment.deleteMany({
          where: { doctorId: { in: createdDoctorIds } },
        });
        await prisma.doctorSlot.deleteMany({
          where: { doctorId: { in: createdDoctorIds } },
        });
        await prisma.doctor.deleteMany({
          where: { id: { in: createdDoctorIds } },
        });
      }
    });

    async function freshDoctor(): Promise<string> {
      const doc = await prisma.doctor.create({
        data: {
          name: `Dr. US8 ${Date.now()}-${Math.random()}`,
          categoryId: 'seed_cardiology',
          status: 'ACTIVE',
        },
      });
      createdDoctorIds.push(doc.id);
      return doc.id;
    }

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(server).get('/api/admin/slots');
      expect(res.status).toBe(401);
    });

    it('admin creates a slot (201) with valid future times', async () => {
      const doctorId = await freshDoctor();
      const startsAt = new Date(Date.now() + 3600_000).toISOString();
      const endsAt = new Date(Date.now() + 5400_000).toISOString();
      const res = await request(server)
        .post(`/api/admin/doctors/${doctorId}/slots`)
        .set('Cookie', admin.cookie)
        .send({ startsAt, endsAt });
      expect(res.status).toBe(201);
      const body = res.body as { slot: { id: string; status: string } };
      expect(body.slot.status).toBe('AVAILABLE');
      createdSlotIds.push(body.slot.id);
    });

    it('rejects past-time slot (400)', async () => {
      const doctorId = await freshDoctor();
      const startsAt = new Date(Date.now() - 7200_000).toISOString();
      const endsAt = new Date(Date.now() - 3600_000).toISOString();
      const res = await request(server)
        .post(`/api/admin/doctors/${doctorId}/slots`)
        .set('Cookie', admin.cookie)
        .send({ startsAt, endsAt });
      expect(res.status).toBe(400);
    });

    it('rejects endsAt <= startsAt (400)', async () => {
      const doctorId = await freshDoctor();
      const startsAt = new Date(Date.now() + 7200_000).toISOString();
      const endsAt = startsAt;
      const res = await request(server)
        .post(`/api/admin/doctors/${doctorId}/slots`)
        .set('Cookie', admin.cookie)
        .send({ startsAt, endsAt });
      expect(res.status).toBe(400);
    });

    it('rejects non-existent doctor (404)', async () => {
      const res = await request(server)
        .post('/api/admin/doctors/doctor_does_not_exist/slots')
        .set('Cookie', admin.cookie)
        .send({
          startsAt: new Date(Date.now() + 3600_000).toISOString(),
          endsAt: new Date(Date.now() + 5400_000).toISOString(),
        });
      expect(res.status).toBe(404);
    });

    it('rejects DEACTIVATED doctor (400)', async () => {
      const doc = await prisma.doctor.create({
        data: {
          name: `Dr. US8 Deact ${Date.now()}`,
          categoryId: 'seed_cardiology',
          status: 'DEACTIVATED',
        },
      });
      createdDoctorIds.push(doc.id);
      const res = await request(server)
        .post(`/api/admin/doctors/${doc.id}/slots`)
        .set('Cookie', admin.cookie)
        .send({
          startsAt: new Date(Date.now() + 3600_000).toISOString(),
          endsAt: new Date(Date.now() + 5400_000).toISOString(),
        });
      expect(res.status).toBe(400);
    });

    it('admin lists slots (200, paginated)', async () => {
      const res = await request(server)
        .get('/api/admin/slots?page=1&pageSize=10')
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(200);
      const body = res.body as {
        slots: unknown[];
        total: number;
        page: number;
        pageSize: number;
      };
      expect(Array.isArray(body.slots)).toBe(true);
      expect(typeof body.total).toBe('number');
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(10);
    });

    it('admin gets one slot (200) and 404 for missing', async () => {
      const created = await prisma.doctorSlot.create({
        data: {
          doctorId: await freshDoctor(),
          startsAt: new Date(Date.now() + 3600_000),
          endsAt: new Date(Date.now() + 5400_000),
          status: 'AVAILABLE',
        },
      });
      createdSlotIds.push(created.id);
      const ok = await request(server)
        .get(`/api/admin/slots/${created.id}`)
        .set('Cookie', admin.cookie);
      expect(ok.status).toBe(200);
      const miss = await request(server)
        .get('/api/admin/slots/slot_does_not_exist')
        .set('Cookie', admin.cookie);
      expect(miss.status).toBe(404);
    });

    it('admin blocks a slot (idempotent)', async () => {
      const created = await prisma.doctorSlot.create({
        data: {
          doctorId: await freshDoctor(),
          startsAt: new Date(Date.now() + 3600_000),
          endsAt: new Date(Date.now() + 5400_000),
          status: 'AVAILABLE',
        },
      });
      createdSlotIds.push(created.id);
      const r1 = await request(server)
        .patch(`/api/admin/slots/${created.id}/block`)
        .set('Cookie', admin.cookie);
      expect(r1.status).toBe(200);
      expect((r1.body as { slot: { status: string } }).slot.status).toBe(
        'BLOCKED',
      );
      const r2 = await request(server)
        .patch(`/api/admin/slots/${created.id}/block`)
        .set('Cookie', admin.cookie);
      expect(r2.status).toBe(200);
    });

    it('admin deletes AVAILABLE slot (204)', async () => {
      const created = await prisma.doctorSlot.create({
        data: {
          doctorId: await freshDoctor(),
          startsAt: new Date(Date.now() + 3600_000),
          endsAt: new Date(Date.now() + 5400_000),
          status: 'AVAILABLE',
        },
      });
      const res = await request(server)
        .delete(`/api/admin/slots/${created.id}`)
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(204);
    });

    it('rejects delete of BOOKED slot (409)', async () => {
      const created = await prisma.doctorSlot.create({
        data: {
          doctorId: await freshDoctor(),
          startsAt: new Date(Date.now() + 3600_000),
          endsAt: new Date(Date.now() + 5400_000),
          status: 'BOOKED',
        },
      });
      createdSlotIds.push(created.id);
      const res = await request(server)
        .delete(`/api/admin/slots/${created.id}`)
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(409);
    });

    it('rejects non-admin (403)', async () => {
      const patient = await getPatientSession(
        server,
        prisma,
        Math.floor(Math.random() * 1000),
      );
      try {
        const res = await request(server)
          .get('/api/admin/slots')
          .set('Cookie', patient.cookie);
        expect(res.status).toBe(403);
      } finally {
        await prisma.user.deleteMany({ where: { id: patient.userId } });
      }
    });
  });
});

// Helper exports for use by other test files in this suite
export { signIn, getAdminSession, getPatientSession };
export type { AdminSession, PatientSession };
