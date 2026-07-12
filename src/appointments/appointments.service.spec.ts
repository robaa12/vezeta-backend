import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppointmentsService } from './appointments.service.js';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      doctor: { findUnique: jest.fn() },
      doctorSlot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  it('boots', () => {
    expect(service).toBeDefined();
  });
});
