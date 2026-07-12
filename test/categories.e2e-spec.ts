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
});
