import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAdminReviewsDto, ListReviewsDto } from './list-reviews.dto.js';

describe('ListReviewsDto', () => {
  it('transforms URL pagination values to numbers', async () => {
    const query = plainToInstance(ListAdminReviewsDto, {
      doctorId: 'doctor-1',
      page: '2',
      pageSize: '20',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({
      doctorId: 'doctor-1',
      page: 2,
      pageSize: 20,
    });
  });

  it('rejects pagination outside the supported range', async () => {
    const query = plainToInstance(ListReviewsDto, {
      page: '0',
      pageSize: '101',
    });

    const errors = await validate(query);

    expect(errors.map((error) => error.property)).toEqual(['page', 'pageSize']);
  });
});
