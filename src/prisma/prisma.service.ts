import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Prisma connected');
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        if (attempt < MAX_RETRIES) {
          const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
          this.logger.warn(
            `Prisma connection attempt ${attempt}/${MAX_RETRIES} failed: ${message} — retrying in ${waitMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else {
          throw new Error(
            `Prisma failed to connect after ${MAX_RETRIES} attempts: ${message}`,
          );
        }
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
