// Google Maps deep links are only exposed when an admin has placed a
// deliberate, precise pin. The text address is still shown independently.
const GOOGLE_MAPS_BASE = 'https://www.google.com/maps';
const COORDINATE_PRECISION = 7;

export interface LaboratoryLocationLike {
  address: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

export function buildLaboratoryGoogleMapsUrl(
  location: LaboratoryLocationLike,
): string | null {
  const { latitude, longitude } = location;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  const lat = Number(latitude.toFixed(COORDINATE_PRECISION));
  const lng = Number(longitude.toFixed(COORDINATE_PRECISION));
  return `${GOOGLE_MAPS_BASE}?q=${lat},${lng}`;
}
