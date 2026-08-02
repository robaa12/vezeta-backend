// Shared helper for building a Google Maps deep link from the free-text
// `address` and optional `latitude` / `longitude` fields on a Doctor.
//
// Resolution order:
//   1. If BOTH latitude and longitude are set, return a precise
//      `https://www.google.com/maps?q=<lat>,<lng>` link that drops a pin
//      on the exact location.
//   2. Otherwise, if `address` is a non-empty trimmed string, return
//      a `https://www.google.com/maps?q=<urlencoded address>` search
//      link. Google Maps geocodes the query and shows the result.
//   3. If neither is available, return null. Callers should treat null
//      as "this doctor has no mappable location yet" and hide the
//      "View on map" link in the UI.
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
  const address = location.address?.trim();
  if (address && address.length > 0) {
    return `${GOOGLE_MAPS_BASE}?q=${encodeURIComponent(address)}`;
  }
  return null;
}
