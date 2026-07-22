import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MedicalRecordsService } from './medical-records.service.js';

describe('MedicalRecordsService', () => {
  let service: MedicalRecordsService;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      appointment: { findUnique: jest.fn() },
      medicalRecord: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalRecordsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MedicalRecordsService);
  });

  describe('createForAppointment', () => {
    it('returns 404 when the appointment does not exist', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce(
        null,
      );
      await expect(
        service.createForAppointment('a1', 'm1', { notes: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 409 when the appointment is not COMPLETED', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'a1',
        userId: 'u1',
        doctorId: 'd1',
        status: 'CONFIRMED',
        medicalRecord: null,
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      await expect(
        service.createForAppointment('a1', 'm1', { notes: 'x' }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 409 when a record already exists (P2002 from unique constraint)', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'a1',
        userId: 'u1',
        doctorId: 'd1',
        status: 'COMPLETED',
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test' },
      );
      (prisma['medicalRecord'].create as jest.Mock).mockRejectedValueOnce(
        p2002,
      );
      await expect(
        service.createForAppointment('a1', 'm1', { notes: 'x' }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 400 when no fields are supplied', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'a1',
        userId: 'u1',
        doctorId: 'd1',
        status: 'COMPLETED',
        medicalRecord: null,
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      await expect(
        service.createForAppointment('a1', 'm1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the record on the happy path and stores patientId/doctorId from the appointment', async () => {
      (prisma['appointment'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'a1',
        userId: 'u1',
        doctorId: 'd1',
        status: 'COMPLETED',
        medicalRecord: null,
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      (prisma['medicalRecord'].create as jest.Mock).mockResolvedValueOnce({
        id: 'mr1',
        appointmentId: 'a1',
        patientId: 'u1',
        doctorId: 'd1',
        notes: 'notes',
        attachmentUrls: [],
        createdById: 'm1',
        createdAt: new Date(),
        updatedAt: new Date(),
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      const result = await service.createForAppointment('a1', 'm1', {
        notes: 'notes',
      });
      expect(result.medicalRecord.id).toBe('mr1');
      const args = (prisma['medicalRecord'].create as jest.Mock).mock
        .calls[0]?.[0];
      expect(args).toMatchObject({
        data: {
          appointmentId: 'a1',
          patientId: 'u1',
          doctorId: 'd1',
          createdById: 'm1',
          notes: 'notes',
          attachmentUrls: [],
        },
      });
    });
  });

  describe('getByAppointment', () => {
    it('returns 404 when the record does not exist', async () => {
      (prisma['medicalRecord'].findUnique as jest.Mock).mockResolvedValueOnce(
        null,
      );
      await expect(
        service.getByAppointment('u1', 'user', 'a1'),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns 404 when a patient tries to read another patient's record (info disclosure)", async () => {
      (prisma['medicalRecord'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'mr1',
        patientId: 'u2',
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      await expect(
        service.getByAppointment('u1', 'user', 'a1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets an admin read any record', async () => {
      (prisma['medicalRecord'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'mr1',
        appointmentId: 'a1',
        patientId: 'u2',
        doctorId: 'd1',
        notes: null,
        attachmentUrls: [],
        createdById: 'm1',
        createdAt: new Date(),
        updatedAt: new Date(),
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      const result = await service.getByAppointment('admin1', 'admin', 'a1');
      expect(result.medicalRecord.id).toBe('mr1');
    });

    it('lets the owning patient read their own record', async () => {
      (prisma['medicalRecord'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'mr1',
        appointmentId: 'a1',
        patientId: 'u1',
        doctorId: 'd1',
        notes: 'notes',
        attachmentUrls: [],
        createdById: 'm1',
        createdAt: new Date(),
        updatedAt: new Date(),
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      const result = await service.getByAppointment('u1', 'user', 'a1');
      expect(result.medicalRecord.notes).toBe('notes');
    });
  });

  describe('listMyHistory', () => {
    it('filters by patientId', async () => {
      (prisma['medicalRecord'].findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma['medicalRecord'].count as jest.Mock).mockResolvedValueOnce(0);
      await service.listMyHistory('u1', {});
      const where = (prisma['medicalRecord'].findMany as jest.Mock).mock
        .calls[0]?.[0]?.where as Record<string, unknown>;
      expect(where).toMatchObject({ patientId: 'u1' });
    });
  });

  describe('updateForAppointment', () => {
    it('returns 404 when the record does not exist', async () => {
      (prisma['medicalRecord'].findUnique as jest.Mock).mockResolvedValueOnce(
        null,
      );
      await expect(
        service.updateForAppointment('a1', { notes: 'new' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 400 when no fields are supplied', async () => {
      (prisma['medicalRecord'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'mr1',
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      await expect(service.updateForAppointment('a1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('updates notes on the happy path', async () => {
      (prisma['medicalRecord'].findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'mr1',
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      (prisma['medicalRecord'].update as jest.Mock).mockResolvedValueOnce({
        id: 'mr1',
        appointmentId: 'a1',
        patientId: 'u1',
        doctorId: 'd1',
        notes: 'new notes',
        attachmentUrls: [],
        createdById: 'm1',
        createdAt: new Date(),
        updatedAt: new Date(),
        doctor: { id: 'd1', name: 'Dr. X' },
      });
      const result = await service.updateForAppointment('a1', {
        notes: 'new notes',
      });
      expect(result.medicalRecord.notes).toBe('new notes');
      const args = (prisma['medicalRecord'].update as jest.Mock).mock
        .calls[0]?.[0];
      expect(args).toMatchObject({
        where: { appointmentId: 'a1' },
        data: { notes: 'new notes' },
      });
    });
  });
});
