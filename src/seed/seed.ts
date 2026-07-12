import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createAuth } from '../auth/auth.js';

const logger = new Logger('SeedScript');

interface SeedEnv {
  email: string;
  phone: string;
  password: string;
  name: string;
}

function readEnv(): SeedEnv {
  const email = process.env.SEED_ADMIN_EMAIL;
  const phone = process.env.SEED_ADMIN_PHONE;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME;

  if (!email || !phone || !password || !name) {
    throw new Error(
      'Missing required env vars: SEED_ADMIN_EMAIL, SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME',
    );
  }
  return { email, phone, password, name };
}

async function main(): Promise<void> {
  const env = readEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const auth = createAuth(
    prisma as unknown as Parameters<typeof createAuth>[0],
  );

  try {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: env.email },
    });
    const existingByRole = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (existingByEmail || existingByRole) {
      logger.log(
        `Super Admin already exists (${existingByEmail?.email ?? existingByRole?.email ?? 'unknown'}). Skipping creation.`,
      );
    } else {
      logger.log(`Creating Super Admin: ${env.email}`);

      const tempEmail = `admin+${Date.now()}@vezeta.local`;
      const signUp = (await auth.api.signUpEmail({
        body: {
          name: env.name,
          email: tempEmail,
          password: env.password,
        },
      })) as { user?: { id?: string } };

      const userId = signUp.user?.id;
      if (!userId) {
        throw new Error('Failed to create user via Better Auth');
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          email: env.email,
          emailVerified: true,
          role: 'admin',
          isActive: true,
        },
      });

      logger.log(`Super Admin created successfully: ${env.email}`);
    }

    // Seed default categories (idempotent via deterministic ids).
    // Feature 005-doctor-categories.
    const defaultCategories = [
      'Cardiology',
      'Pediatrics',
      'Dermatology',
      'Orthopedics',
      'General Practice',
    ];

    for (const name of defaultCategories) {
      const deterministicId = `seed_${name.toLowerCase().replace(/\s+/g, '_')}`;
      await prisma.category.upsert({
        where: { id: deterministicId },
        update: {},
        create: {
          id: deterministicId,
          name,
          status: 'ACTIVE',
        },
      });
    }

    logger.log(`Default categories ensured: ${defaultCategories.join(', ')}`);
  } catch (error) {
    logger.error(
      'Seed failed',
      error instanceof Error ? error.stack : String(error),
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
