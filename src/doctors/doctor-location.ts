// Shared helper for building a Google Maps deep link from a doctor's
// optional `latitude` / `longitude` map pin.
//
// Rules:
//   1. If BOTH latitude and longitude are set, return a precise
//      `https://www.google.com/maps?q=<lat>,<lng>` link that drops a pin
//      on the exact location.
//   2. Otherwise return null, even when an address exists. The written
//      address remains visible as plain text, but a Maps action must only
//      appear after an admin deliberately picks a precise point on the map.
//
// Coordinates are formatted with up to 7 decimal places (~11 mm
// precision) — that's the precision Google Maps' `q=` parameter
// honours; more digits are wasted bytes.

const GOOGLE_MAPS_BASE = 'https://www.google.com/maps';

const COORDINATE_PRECISION = 7;

function formatCoord(value: number): string {
  return Number(value.toFixed(COORDINATE_PRECISION)).toString();
}

export interface DoctorLocationLike {
  address: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

export function buildGoogleMapsUrl(
  location: DoctorLocationLike,
): string | null {
  const lat = location.latitude;
  const lng = location.longitude;
  if (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng)
  ) {
    return `${GOOGLE_MAPS_BASE}?q=${formatCoord(lat)},${formatCoord(lng)}`;
  }
  return null;
}
