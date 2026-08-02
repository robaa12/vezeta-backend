import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDoctorDto } from './create-doctor.dto.js';
import { UpdateDoctorDto } from './update-doctor.dto.js';

describe('Doctor location DTOs', () => {
  it('converts multipart Google Maps coordinates to numbers', async () => {
    const dto = plainToInstance(CreateDoctorDto, {
      name: 'Dr. Jane Smith',
      categoryId: 'cat-1',
      address: '15 Tahrir Square, Cairo, Egypt',
      latitude: '30.0444',
      longitude: '31.2357',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.latitude).toBe(30.0444);
    expect(dto.longitude).toBe(31.2357);
  });

  it('keeps null coordinates when an admin clears a location', async () => {
    const dto = plainToInstance(UpdateDoctorDto, {
      latitude: null,
      longitude: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.latitude).toBeNull();
    expect(dto.longitude).toBeNull();
  });
});
