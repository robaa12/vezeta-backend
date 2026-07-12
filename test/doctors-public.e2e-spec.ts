import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

const HAS_DB = !!process.env.DATABASE_URL;
const describeMaybe = HAS_DB ? describe : describe.skip;

interface ListDoctorsResponse {
  doctors: Array<{
    id: string;
    name: string;
    category: { id: string; name: string };
    status: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

interface DoctorResponse {
  doctor: {
    id: string;
    name: string;
    category: { id: string; name: string };
    status: string;
  };
}

describeMaybe('Doctor Search & Discovery (004 + 005)', () => {
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

  describe('Scenario 1: List with no filter (no auth)', () => {
    it('returns 200 without any auth header', async () => {
      const res = await request(server).get('/api/doctors');
      expect(res.status).toBe(200);
      const body = res.body as ListDoctorsResponse;
      expect(body.doctors).toBeDefined();
      expect(typeof body.total).toBe('number');
      expect(typeof body.page).toBe('number');
      expect(typeof body.pageSize).toBe('number');
    });

    it('sets Cache-Control header on the listing', async () => {
      const res = await request(server).get('/api/doctors');
      expect(res.headers['cache-control']).toMatch(/max-age=60/);
    });
  });

  describe('Scenario 2: Filter by categoryId (feature 005)', () => {
    it('returns 200 with the matching doctors (or empty if no match)', async () => {
      const res = await request(server)
        .get('/api/doctors')
        .query({ categoryId: 'seed_cardiology' });
      expect(res.status).toBe(200);
    });

    it('returns 200 with empty array for unmatched categoryId', async () => {
      const res = await request(server)
        .get('/api/doctors')
        .query({ categoryId: 'cat_does_not_exist_xyz' });
      expect(res.status).toBe(200);
      const body = res.body as ListDoctorsResponse;
      expect(body.doctors).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('Scenario 3: Search by name (case-insensitive)', () => {
    it('accepts a search term and returns 200', async () => {
      const res = await request(server)
        .get('/api/doctors')
        .query({ search: 'Smith' });
      expect(res.status).toBe(200);
    });
  });

  describe('Scenario 4: Combined filters', () => {
    it('accepts categoryId + search together', async () => {
      const res = await request(server)
        .get('/api/doctors')
        .query({ categoryId: 'seed_cardiology', search: 'Jane' });
      expect(res.status).toBe(200);
    });
  });

  describe('Scenario 5: Public profile — ACTIVE doctor', () => {
    it('returns 200 with doctor record when found (smoke)', async () => {
      const list = await request(server).get('/api/doctors');
      expect(list.status).toBe(200);
      const body = list.body as ListDoctorsResponse;
      if (body.doctors.length === 0) {
        return;
      }
      const id = body.doctors[0].id;
      const res = await request(server).get(`/api/doctors/${id}`);
      expect(res.status).toBe(200);
      const profile = res.body as DoctorResponse;
      expect(profile.doctor.id).toBe(id);
      expect(profile.doctor.status).toBe('ACTIVE');
      expect(profile.doctor.category).toBeDefined();
      expect(typeof profile.doctor.category.id).toBe('string');
      expect(typeof profile.doctor.category.name).toBe('string');
    });

    it('returns 404 for a non-existent doctor id', async () => {
      const res = await request(server).get(
        '/api/doctors/this-id-does-not-exist-anywhere',
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Scenario 6: Public profile — DEACTIVATED returns 404', () => {
    it('returns 404 (smoke)', async () => {
      const res = await request(server).get(
        '/api/doctors/deactivated-id-smoke',
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Scenario 7: Specialties endpoint removed (feature 005)', () => {
    it('returns 404 — /api/specialties is no longer exposed', async () => {
      const res = await request(server).get('/api/specialties');
      expect(res.status).toBe(404);
    });
  });

  describe('Scenario 8: Pagination', () => {
    it('accepts page and pageSize query params', async () => {
      const res = await request(server)
        .get('/api/doctors')
        .query({ page: 1, pageSize: 5 });
      expect(res.status).toBe(200);
      const body = res.body as ListDoctorsResponse;
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(5);
    });
  });

  describe('Scenario 10: Validation — invalid query params return 400', () => {
    it('returns 400 for page < 1', async () => {
      const res = await request(server).get('/api/doctors').query({ page: 0 });
      expect(res.status).toBe(400);
    });

    it('returns 400 for pageSize > 100', async () => {
      const res = await request(server)
        .get('/api/doctors')
        .query({ pageSize: 101 });
      expect(res.status).toBe(400);
    });

    it('returns 400 for search > 120 chars', async () => {
      const longSearch = 'a'.repeat(121);
      const res = await request(server)
        .get('/api/doctors')
        .query({ search: longSearch });
      expect(res.status).toBe(400);
    });

    it('returns 400 for categoryId > 64 chars', async () => {
      const longId = 'a'.repeat(65);
      const res = await request(server)
        .get('/api/doctors')
        .query({ categoryId: longId });
      expect(res.status).toBe(400);
    });
  });

  describe('Scenario 11: No auth required', () => {
    it('list endpoint returns 200 without cookie or Authorization header', async () => {
      const res = await request(server).get('/api/doctors');
      expect(res.status).toBe(200);
    });

    it('profile endpoint returns 200 or 404 without cookie (not 401)', async () => {
      const res = await request(server).get('/api/doctors/some-id');
      expect([200, 404]).toContain(res.status);
    });
  });
});
