import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

const HAS_DB = !!process.env.DATABASE_URL;
const describeMaybe = HAS_DB ? describe : describe.skip;

// Skeleton for the 005-doctor-categories e2e suite. Per-user-story
// describe blocks are appended in subsequent commits (US1, US2, ...).
describeMaybe('Doctor Categories (005-doctor-categories)', () => {
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

  it('boots the app and exposes the public categories endpoint', async () => {
    // The public /api/categories endpoint is registered in US5
    // (Commit 3). For Commit 1 the route is NOT yet wired; this
    // test is the boot smoke for the categories module loading.
    const publicList = await request(server).get('/api/categories');
    // 200 once US5 lands; 404 before that. Both indicate the app booted.
    expect([200, 404]).toContain(publicList.status);
  });
});
