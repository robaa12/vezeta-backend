import { describe, expect, it } from '@jest/globals';
import { buildLaboratoryGoogleMapsUrl } from './laboratory-location.js';

describe('buildLaboratoryGoogleMapsUrl', () => {
  it('builds a precise Google Maps URL for a pinned laboratory', () => {
    expect(
      buildLaboratoryGoogleMapsUrl({
        address: '15 Tahrir Square, Cairo, Egypt',
        latitude: 30.0444,
        longitude: 31.2357,
      }),
    ).toBe('https://www.google.com/maps?q=30.0444,31.2357');
  });

  it('does not create a Maps URL without a complete pin', () => {
    expect(
      buildLaboratoryGoogleMapsUrl({
        address: '15 Tahrir Square, Cairo, Egypt',
        latitude: 30.0444,
        longitude: null,
      }),
    ).toBeNull();
  });
});
