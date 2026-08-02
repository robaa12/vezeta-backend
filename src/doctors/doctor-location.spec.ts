import { describe, expect, it } from '@jest/globals';
import { buildGoogleMapsUrl } from './doctor-location.js';

describe('buildGoogleMapsUrl', () => {
  it('builds a precise link when the admin selected both coordinates', () => {
    expect(
      buildGoogleMapsUrl({
        address: '15 Tahrir Square, Cairo, Egypt',
        latitude: 30.0444,
        longitude: 31.2357,
      }),
    ).toBe('https://www.google.com/maps?q=30.0444,31.2357');
  });

  it('does not build a link from a written address without a map pin', () => {
    expect(
      buildGoogleMapsUrl({
        address: '15 Tahrir Square, Cairo, Egypt',
        latitude: null,
        longitude: null,
      }),
    ).toBeNull();
  });

  it('does not build a link from an incomplete coordinate pair', () => {
    expect(
      buildGoogleMapsUrl({
        address: '15 Tahrir Square, Cairo, Egypt',
        latitude: 30.0444,
        longitude: null,
      }),
    ).toBeNull();
  });
});
