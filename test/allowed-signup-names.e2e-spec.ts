import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { claimAllowedSignupName } from '../src/allowed-signup-names/signup-name-claim.js';

const HAS_DB = !!process.env.DATABASE_URL;
const describeMaybe = HAS_DB ? describe : describe.skip;

interface AdminSession {
  cookie: string;
}

async function getAdminSession(server: Server): Promise<AdminSession> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@vezeta.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
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
  return { cookie: match[0] };
}

describeMaybe('Signup allowlist', () => {
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
      await prisma.allowedSignupName.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
    await prisma.$disconnect();
    await app.close();
  });

  const uniqueName = (): string => `Ahmed Ali Hassan T${Date.now()}`;

  describe('Admin CRUD', () => {
    it('creates an entry, normalizing the stored match key', async () => {
      const name = uniqueName();
      const res = await request(server)
        .post('/api/admin/allowed-signup-names')
        .set('Cookie', admin.cookie)
        .send({ name: `  ${name.toUpperCase()}  ` })
        .expect(201);

      createdIds.push(res.body.id as string);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.usedByEmail).toBeNull();

      const row = await prisma.allowedSignupName.findUnique({
        where: { id: res.body.id as string },
      });
      expect(row?.normalizedName).toBe(name.toLowerCase());
    });

    it('rejects a name that is not exactly four words', async () => {
      await request(server)
        .post('/api/admin/allowed-signup-names')
        .set('Cookie', admin.cookie)
        .send({ name: 'Ahmed Ali Hassan' })
        .expect(400);
    });

    it('rejects an unknown query parameter', async () => {
      await request(server)
        .get('/api/admin/allowed-signup-names?bogus=1')
        .set('Cookie', admin.cookie)
        .expect(400);
    });

    it('rejects a duplicate ACTIVE name', async () => {
      const name = uniqueName();
      const first = await request(server)
        .post('/api/admin/allowed-signup-names')
        .set('Cookie', admin.cookie)
        .send({ name })
        .expect(201);
      createdIds.push(first.body.id as string);

      const duplicate = await request(server)
        .post('/api/admin/allowed-signup-names')
        .set('Cookie', admin.cookie)
        .send({ name: name.toLowerCase() })
        .expect(409);
      expect(duplicate.body.error).toBe('duplicate_name');
    });

    it('lists entries in the paginated envelope', async () => {
      const res = await request(server)
        .get('/api/admin/allowed-signup-names?status=ACTIVE&page=1&pageSize=5')
        .set('Cookie', admin.cookie)
        .expect(200);

      expect(Array.isArray(res.body.allowedSignupNames)).toBe(true);
      expect(res.body).toMatchObject({ page: 1, pageSize: 5 });
      expect(typeof res.body.total).toBe('number');
    });

    it('requires the admin role', async () => {
      await request(server)
        .get('/api/admin/allowed-signup-names')
        .expect((res) => {
          if (res.status !== 401 && res.status !== 403) {
            throw new Error(`Expected 401/403, got ${res.status}`);
          }
        });
    });
  });

  describe('Claiming a name at signup', () => {
    // The e2e suite runs with NODE_ENV=test, which disables the gate on the
    // HTTP sign-up route so the other auth specs can register throwaway users.
    // The claim itself is exercised directly here, against real Postgres, so
    // the single-use guarantee is covered where it actually matters.
    it('consumes an ACTIVE entry exactly once', async () => {
      const name = uniqueName();
      const created = await request(server)
        .post('/api/admin/allowed-signup-names')
        .set('Cookie', admin.cookie)
        .send({ name })
        .expect(201);
      createdIds.push(created.body.id as string);

      await expect(
        claimAllowedSignupName(prisma, `  ${name.toUpperCase()} `, 'first@e2e.local'),
      ).resolves.toBe(true);

      const afterClaim = await prisma.allowedSignupName.findUnique({
        where: { id: created.body.id as string },
      });
      expect(afterClaim?.status).toBe('USED');
      expect(afterClaim?.usedByEmail).toBe('first@e2e.local');

      // Second attempt with the same name finds no ACTIVE row.
      await expect(
        claimAllowedSignupName(prisma, name, 'second@e2e.local'),
      ).resolves.toBe(false);
      const afterSecond = await prisma.allowedSignupName.findUnique({
        where: { id: created.body.id as string },
      });
      expect(afterSecond?.usedByEmail).toBe('first@e2e.local');
    });

    it('lets only one of several concurrent claims win', async () => {
      const name = uniqueName();
      const created = await request(server)
        .post('/api/admin/allowed-signup-names')
        .set('Cookie', admin.cookie)
        .send({ name })
        .expect(201);
      createdIds.push(created.body.id as string);

      const results = await Promise.all(
        Array.from({ length: 5 }, (_unused, index) =>
          claimAllowedSignupName(prisma, name, `race${index}@e2e.local`),
        ),
      );

      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('refuses a name that is not on the list', async () => {
      await expect(
        claimAllowedSignupName(
          prisma,
          `Nobody Here At T${Date.now()}`,
          'nobody@e2e.local',
        ),
      ).resolves.toBe(false);
    });

    it('releases a consumed entry when the admin sets it back to ACTIVE', async () => {
      const name = uniqueName();
      const created = await request(server)
        .post('/api/admin/allowed-signup-names')
        .set('Cookie', admin.cookie)
        .send({ name })
        .expect(201);
      const id = created.body.id as string;
      createdIds.push(id);

      await claimAllowedSignupName(prisma, name, 'burned@e2e.local');

      const released = await request(server)
        .patch(`/api/admin/allowed-signup-names/${id}`)
        .set('Cookie', admin.cookie)
        .send({ status: 'ACTIVE' })
        .expect(200);

      expect(released.body.status).toBe('ACTIVE');
      expect(released.body.usedByEmail).toBeNull();
      await expect(
        claimAllowedSignupName(prisma, name, 'retry@e2e.local'),
      ).resolves.toBe(true);
    });
  });
});
