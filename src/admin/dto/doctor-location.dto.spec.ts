import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateDoctorDto } from './create-doctor.dto.js';
import { UpdateDoctorDto } from './update-doctor.dto.js';

describe('doctor location DTO multipart transforms', () => {
  it('converts create coordinates from multipart strings to numbers', () => {
    const dto = plainToInstance(CreateDoctorDto, {
      name: 'Dr. Jane Smith',
      categoryId: 'cat1',
      address: '15 Tahrir Square, Cairo, Egypt',
      latitude: '30.0444',
      longitude: '31.2357',
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.latitude).toBe(30.0444);
    expect(dto.longitude).toBe(31.2357);
  });

  it('requires a non-blank clinic address when creating a doctor', () => {
    const missing = plainToInstance(CreateDoctorDto, {
      name: 'Dr. Jane Smith',
      categoryId: 'cat1',
    });
    const blank = plainToInstance(CreateDoctorDto, {
      name: 'Dr. Jane Smith',
      categoryId: 'cat1',
      address: '   ',
    });

    expect(validateSync(missing)).toHaveLength(1);
    expect(validateSync(blank)).toHaveLength(1);
  });

  it('converts update coordinates and supports clearing with empty fields', () => {
    const updated = plainToInstance(UpdateDoctorDto, {
      latitude: '30.0444',
      longitude: '31.2357',
    });
    const cleared = plainToInstance(UpdateDoctorDto, {
      latitude: '',
      longitude: '',
    });

    expect(validateSync(updated)).toHaveLength(0);
    expect(updated.latitude).toBe(30.0444);
    expect(updated.longitude).toBe(31.2357);
    expect(validateSync(cleared)).toHaveLength(0);
    expect(cleared.latitude).toBeNull();
    expect(cleared.longitude).toBeNull();
  });

  it('rejects out-of-range multipart coordinates', () => {
    const dto = plainToInstance(UpdateDoctorDto, {
      latitude: '91',
      longitude: '181',
    });

    expect(validateSync(dto)).toHaveLength(2);
  });
});
