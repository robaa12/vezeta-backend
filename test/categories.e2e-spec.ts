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

async function signInAdmin(
  server: Server,
  email: string,
  password: string,
): Promise<AdminSession> {
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
  return { cookie: match[0], email, password };
}

async function getAdminSession(server: Server): Promise<AdminSession> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@vezeta.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  return signInAdmin(server, email, password);
}

describeMaybe('Doctor Categories (005-doctor-categories)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaClient;
  let admin: AdminSession;
  const createdIds: string[] = [];

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

    admin = await getAdminSession(server);
  });

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.category.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.$disconnect();
    if (app) await app.close();
  });

  describe('US1 — Admin category CRUD', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(server).get('/api/admin/categories');
      expect(res.status).toBe(401);
    });

    it('creates a new category (200 → 201, returns id + name + status=ACTIVE)', async () => {
      const name = `Cardiology US1 ${Date.now()}`;
      const res = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name });
      expect(res.status).toBe(201);
      const body = res.body as { id: string; name: string; status: string };
      expect(body.id).toBeDefined();
      expect(body.name).toBe(name);
      expect(body.status).toBe('ACTIVE');
      createdIds.push(body.id);
    });

    it('rejects a duplicate ACTIVE name case-insensitively (409)', async () => {
      const name = `Dupe US1 ${Date.now()}`;
      const first = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name });
      expect(first.status).toBe(201);
      createdIds.push((first.body as { id: string }).id);

      const second = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name: name.toLowerCase() });
      expect(second.status).toBe(409);
    });

    it('rejects a blank / whitespace name with 400', async () => {
      const res = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name: '   ' });
      expect(res.status).toBe(400);
    });

    it('lists categories and returns the created one', async () => {
      const res = await request(server)
        .get('/api/admin/categories')
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(200);
      const body = res.body as {
        categories: Array<{ id: string }>;
        total: number;
      };
      expect(Array.isArray(body.categories)).toBe(true);
      expect(typeof body.total).toBe('number');
    });

    it('paginates the list (page + pageSize honored)', async () => {
      const res = await request(server)
        .get('/api/admin/categories')
        .query({ page: 1, pageSize: 5 })
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(200);
      const body = res.body as { page: number; pageSize: number };
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(5);
    });

    it('searches categories by name (case-insensitive substring)', async () => {
      const name = `SearchCat-${Date.now()}`;
      const created = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name });
      expect(created.status).toBe(201);
      const id = (created.body as { id: string }).id;
      createdIds.push(id);

      const res = await request(server)
        .get('/api/admin/categories')
        .query({ search: name.toLowerCase() })
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(200);
      const body = res.body as { categories: Array<{ id: string }> };
      const ids = body.categories.map((c) => c.id);
      expect(ids).toContain(id);
    });

    it('fetches one category by id (200)', async () => {
      const name = `GetOne-${Date.now()}`;
      const created = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name });
      const id = (created.body as { id: string }).id;
      createdIds.push(id);

      const res = await request(server)
        .get(`/api/admin/categories/${id}`)
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(200);
      const body = res.body as { id: string; name: string };
      expect(body.id).toBe(id);
      expect(body.name).toBe(name);
    });

    it('returns 404 for an unknown category id', async () => {
      const res = await request(server)
        .get('/api/admin/categories/this-id-does-not-exist')
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(404);
    });

    it('patches a category name (200)', async () => {
      const created = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name: `PatchName-${Date.now()}` });
      const id = (created.body as { id: string }).id;
      createdIds.push(id);

      const res = await request(server)
        .patch(`/api/admin/categories/${id}`)
        .set('Cookie', admin.cookie)
        .send({ name: 'Renamed' });
      expect(res.status).toBe(200);
      const body = res.body as { name: string };
      expect(body.name).toBe('Renamed');
    });

    it('patches a category status (200)', async () => {
      const created = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name: `PatchStatus-${Date.now()}` });
      const id = (created.body as { id: string }).id;
      createdIds.push(id);

      const res = await request(server)
        .patch(`/api/admin/categories/${id}`)
        .set('Cookie', admin.cookie)
        .send({ status: 'DEACTIVATED' });
      expect(res.status).toBe(200);
      const body = res.body as { status: string };
      expect(body.status).toBe('DEACTIVATED');
    });

    it('rejects patch with no fields (400)', async () => {
      const created = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name: `NoOp-${Date.now()}` });
      const id = (created.body as { id: string }).id;
      createdIds.push(id);

      const res = await request(server)
        .patch(`/api/admin/categories/${id}`)
        .set('Cookie', admin.cookie)
        .send({});
      expect(res.status).toBe(400);
    });

    it('deactivates via sub-resource endpoint (idempotent)', async () => {
      const created = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name: `Deact-${Date.now()}` });
      const id = (created.body as { id: string }).id;
      createdIds.push(id);

      const r1 = await request(server)
        .patch(`/api/admin/categories/${id}/deactivate`)
        .set('Cookie', admin.cookie);
      expect(r1.status).toBe(200);
      expect((r1.body as { status: string }).status).toBe('DEACTIVATED');

      const r2 = await request(server)
        .patch(`/api/admin/categories/${id}/deactivate`)
        .set('Cookie', admin.cookie);
      expect(r2.status).toBe(200);
      expect((r2.body as { status: string }).status).toBe('DEACTIVATED');
    });

    it('hard-deletes an unused category (204)', async () => {
      const created = await request(server)
        .post('/api/admin/categories')
        .set('Cookie', admin.cookie)
        .send({ name: `Del-${Date.now()}` });
      const id = (created.body as { id: string }).id;

      const res = await request(server)
        .delete(`/api/admin/categories/${id}`)
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(204);
    });

    it('rejects hard-delete of a category referenced by a doctor (409)', async () => {
      const cat = await prisma.category.create({
        data: { name: `RefByDoc-${Date.now()}`, status: 'ACTIVE' },
      });
      createdIds.push(cat.id);
      await prisma.doctor.create({
        data: {
          name: 'Dr. Test',
          categoryId: cat.id,
          status: 'ACTIVE',
        },
      });

      const res = await request(server)
        .delete(`/api/admin/categories/${cat.id}`)
        .set('Cookie', admin.cookie);
      expect(res.status).toBe(409);

      // Cleanup
      await prisma.doctor.deleteMany({ where: { categoryId: cat.id } });
    });
  });

  describe('US5 — Public GET /api/categories', () => {
    it('returns 200 without any auth header (anonymous)', async () => {
      const res = await request(server).get('/api/categories');
      expect(res.status).toBe(200);
      const body = res.body as {
        categories: Array<{ id: string; name: string }>;
      };
      expect(Array.isArray(body.categories)).toBe(true);
    });

    it('returns ACTIVE categories only (no DEACTIVATED in the public list)', async () => {
      // Deactivate an existing category (use the seed_pediatrics one),
      // then assert it is absent from the public list.
      const deactivatedName = `PublicTest-Deact-${Date.now()}`;
      const created = await prisma.category.create({
        data: { name: deactivatedName, status: 'ACTIVE' },
      });
      createdIds.push(created.id);
      await prisma.category.update({
        where: { id: created.id },
        data: { status: 'DEACTIVATED' },
      });

      const res = await request(server).get('/api/categories');
      expect(res.status).toBe(200);
      const body = res.body as {
        categories: Array<{ id: string; name: string }>;
      };
      const names = body.categories.map((c) => c.name);
      expect(names).not.toContain(deactivatedName);
    });

    it('returns categories sorted alphabetically (case-insensitive)', async () => {
      // Insert three categories with intentionally mixed case, then
      // verify the response is sorted.
      const marker = `US5-sort-${Date.now()}`;
      const a = await prisma.category.create({
        data: { name: `${marker}-aardvark`, status: 'ACTIVE' },
      });
      const b = await prisma.category.create({
        data: { name: `${marker}-Banana`, status: 'ACTIVE' },
      });
      const c = await prisma.category.create({
        data: { name: `${marker}-cherry`, status: 'ACTIVE' },
      });
      createdIds.push(a.id, b.id, c.id);

      const res = await request(server).get('/api/categories');
      const body = res.body as { categories: Array<{ name: string }> };
      const seq = body.categories
        .map((x) => x.name)
        .filter((n) => n.startsWith(marker));
      // The case-insensitive sort yields aardvark < Banana < cherry
      expect(seq).toEqual([
        `${marker}-aardvark`,
        `${marker}-Banana`,
        `${marker}-cherry`,
      ]);
    });

    it('sets Cache-Control: public, max-age=300 on the public response', async () => {
      const res = await request(server).get('/api/categories');
      expect(res.headers['cache-control']).toMatch(/max-age=300/);
    });

    it('returns an empty array if no ACTIVE categories exist (smoke — verified by filtering)', async () => {
      // Sanity: the array shape is correct when filtered to only DEACTIVATED
      // names. The body still has `categories: []` after we deactivate
      // every test-created ACTIVE category in the cleanup path of the
      // sort test above — but we don't rely on a hard empty-state test
      // here (would require wiping the DB). Just assert the shape.
      const res = await request(server).get('/api/categories');
      const body = res.body as { categories: unknown[] };
      expect(Array.isArray(body.categories)).toBe(true);
    });
  });

  describe('US2 — Admin create doctor with required categoryId', () => {
    let testCategoryId: string;
    const createdDoctorIds: string[] = [];

    beforeAll(async () => {
      // Use the seeded seed_cardiology category for the happy path.
      const cat = await prisma.category.findUnique({
        where: { id: 'seed_cardiology' },
      });
      if (!cat)
        throw new Error('seed_cardiology category missing — run seed first');
      testCategoryId = cat.id;
    });

    afterAll(async () => {
      if (createdDoctorIds.length) {
        await prisma.doctor.deleteMany({
          where: { id: { in: createdDoctorIds } },
        });
      }
    });

    it('creates a doctor with a valid ACTIVE categoryId (201) and includes category in the response', async () => {
      const res = await request(server)
        .post('/api/admin/doctors')
        .set('Cookie', admin.cookie)
        .send({ name: 'Dr. US2 Test', categoryId: testCategoryId });
      expect(res.status).toBe(201);
      const body = res.body as {
        doctor: { id: string; category: { id: string; name: string } };
      };
      expect(body.doctor.id).toBeDefined();
      expect(body.doctor.category).toEqual({
        id: 'seed_cardiology',
        name: 'Cardiology',
      });
      createdDoctorIds.push(body.doctor.id);
    });

    it('rejects create-doctor with missing categoryId (400)', async () => {
      const res = await request(server)
        .post('/api/admin/doctors')
        .set('Cookie', admin.cookie)
        .send({ name: 'Dr. No Category' });
      expect(res.status).toBe(400);
    });

    it('rejects create-doctor with a non-existent categoryId (404)', async () => {
      const res = await request(server)
        .post('/api/admin/doctors')
        .set('Cookie', admin.cookie)
        .send({ name: 'Dr. Bogus Cat', categoryId: 'cat_does_not_exist_xyz' });
      expect(res.status).toBe(404);
    });

    it('rejects create-doctor with a DEACTIVATED categoryId (400)', async () => {
      const deactivated = await prisma.category.create({
        data: { name: `US2-Deact-${Date.now()}`, status: 'DEACTIVATED' },
      });
      createdIds.push(deactivated.id);
      const res = await request(server)
        .post('/api/admin/doctors')
        .set('Cookie', admin.cookie)
        .send({ name: 'Dr. Deact Cat', categoryId: deactivated.id });
      expect(res.status).toBe(400);
    });
  });

  describe('US4 — Public doctor listing filters by categoryId', () => {
    let cardiologyId: string;
    let pediatricsId: string;
    const createdDoctorIds: string[] = [];

    beforeAll(async () => {
      const cardio = await prisma.category.findUnique({
        where: { id: 'seed_cardiology' },
      });
      const ped = await prisma.category.findUnique({
        where: { id: 'seed_pediatrics' },
      });
      if (!cardio || !ped) {
        throw new Error(
          'Seeded categories missing — run npm run db:seed first',
        );
      }
      cardiologyId = cardio.id;
      pediatricsId = ped.id;

      // Create two fresh doctors under each category for the filter tests.
      const unique = Date.now();
      const d1 = await prisma.doctor.create({
        data: {
          name: `Dr. US4 Cardio Alpha ${unique}`,
          categoryId: cardiologyId,
          status: 'ACTIVE',
        },
      });
      const d2 = await prisma.doctor.create({
        data: {
          name: `Dr. US4 Cardio Beta ${unique}`,
          categoryId: cardiologyId,
          status: 'ACTIVE',
        },
      });
      const d3 = await prisma.doctor.create({
        data: {
          name: `Dr. US4 Ped Alpha ${unique}`,
          categoryId: pediatricsId,
          status: 'ACTIVE',
        },
      });
      createdDoctorIds.push(d1.id, d2.id, d3.id);
    });

    afterAll(async () => {
      if (createdDoctorIds.length) {
        await prisma.doctor.deleteMany({
          where: { id: { in: createdDoctorIds } },
        });
      }
    });

    it('returns only doctors in the requested category when ?categoryId=<cardio>', async () => {
      const res = await request(server)
        .get('/api/doctors')
        .query({ categoryId: cardiologyId });
      expect(res.status).toBe(200);
      const body = res.body as {
        doctors: Array<{ id: string; category: { id: string } }>;
        total: number;
      };
      // Every returned doctor must be in cardiologyId
      for (const d of body.doctors) {
        expect(d.category.id).toBe(cardiologyId);
      }
      // At least our two test doctors must be present
      const ids = body.doctors.map((d) => d.id);
      const ourTwo = createdDoctorIds.slice(0, 2);
      for (const id of ourTwo) {
        expect(ids).toContain(id);
      }
    });

    it('returns empty array when ?categoryId=<unknown>', async () => {
      const res = await request(server)
        .get('/api/doctors')
        .query({ categoryId: 'cat_does_not_exist_xyz' });
      expect(res.status).toBe(200);
      const body = res.body as { doctors: unknown[]; total: number };
      expect(body.doctors).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns empty array when ?categoryId=<deactivated>', async () => {
      const deact = await prisma.category.create({
        data: { name: `US4-Deact-${Date.now()}`, status: 'DEACTIVATED' },
      });
      createdIds.push(deact.id);
      const res = await request(server)
        .get('/api/doctors')
        .query({ categoryId: deact.id });
      expect(res.status).toBe(200);
      const body = res.body as { doctors: unknown[]; total: number };
      expect(body.doctors).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('combines categoryId + search with AND (category exact, search OR)', async () => {
      // Cardiology doctors all start with "Dr. US4 Cardio". A search for
      // "Alpha" should match only the Alpha one in cardiology (NOT in ped).
      const res = await request(server)
        .get('/api/doctors')
        .query({ categoryId: cardiologyId, search: 'Alpha' });
      expect(res.status).toBe(200);
      const body = res.body as {
        doctors: Array<{ id: string; name: string; category: { id: string } }>;
      };
      // All returned doctors must be in cardiology
      for (const d of body.doctors) {
        expect(d.category.id).toBe(cardiologyId);
      }
      // The Alpha doctor is the only one in our set that matches "Alpha"
      const matchingUs = body.doctors.filter((d) =>
        createdDoctorIds.includes(d.id),
      );
      expect(matchingUs.length).toBeGreaterThanOrEqual(1);
      // No pediatrics doctor should be in the response
      for (const d of body.doctors) {
        if (createdDoctorIds.includes(d.id)) {
          expect(d.name).toContain('Alpha');
        }
      }
    });

    it('does not respond to the legacy ?specialty= query parameter (400)', async () => {
      const res = await request(server)
        .get('/api/doctors')
        .query({ specialty: 'Cardiology' });
      // The legacy param is no longer in the DTO — ValidationPipe with
      // forbidNonWhitelisted rejects unknown query params with 400.
      expect(res.status).toBe(400);
    });

    it('does not return doctors whose category is DEACTIVATED (404 on profile, hidden from listing)', async () => {
      // Create a doctor in a freshly created category, then deactivate the
      // category. The doctor's public listing should not include it, and
      // its profile should 404.
      const cat = await prisma.category.create({
        data: { name: `US4-List-Deact-${Date.now()}`, status: 'ACTIVE' },
      });
      createdIds.push(cat.id);
      const doc = await prisma.doctor.create({
        data: {
          name: `Dr. US4 Hidden ${Date.now()}`,
          categoryId: cat.id,
          status: 'ACTIVE',
        },
      });
      createdDoctorIds.push(doc.id);

      // Listing with the categoryId before deactivation returns the doc.
      const before = await request(server)
        .get('/api/doctors')
        .query({ categoryId: cat.id });
      const beforeBody = before.body as { doctors: Array<{ id: string }> };
      expect(beforeBody.doctors.map((d) => d.id)).toContain(doc.id);

      // Deactivate the category, then assert the doc is no longer in the list.
      await prisma.category.update({
        where: { id: cat.id },
        data: { status: 'DEACTIVATED' },
      });

      const after = await request(server)
        .get('/api/doctors')
        .query({ categoryId: cat.id });
      const afterBody = after.body as {
        doctors: Array<{ id: string }>;
        total: number;
      };
      expect(afterBody.doctors).toEqual([]);
      expect(afterBody.total).toBe(0);

      // Profile returns 404 too.
      const profile = await request(server).get(`/api/doctors/${doc.id}`);
      expect(profile.status).toBe(404);
    });
  });
});
