/**
 * Delivery pricing — distance bands from the workshop.
 *
 * Microvellum charges shipping as loading time only (10 min/cu m at $120/hr —
 * $66.28 on the Donkin kitchen), which does not cover a 200 km round trip to
 * Mission Beach. This prices the trip itself: a band by road distance from the
 * workshop, scaled by how many vehicle loads the job actually needs.
 *
 * Distance is supplied by the caller. Where the site has coordinates,
 * `estimateRoadDistanceKm` gives a usable figure without a routing service.
 */

/** Bower Cabinets workshop — 2-50 Owen St, Craiglie QLD 4877. */
export const WORKSHOP_ORIGIN = {
  label: '2-50 Owen St, Craiglie QLD 4877',
  lat: -16.5183,
  lng: 145.4611,
};

export interface DeliveryBand {
  /** inclusive lower bound, km, one way by road */
  fromKm: number;
  /** exclusive upper bound, km; null = no upper bound */
  toKm: number | null;
  label: string;
  price: number;
}

/**
 * Bands are one-way road distance from the workshop. The first two match the
 * existing "Delivery Local $150" / "Delivery Regional $350" rate rows.
 */
export const DEFAULT_DELIVERY_BANDS: DeliveryBand[] = [
  { fromKm: 0, toKm: 30, label: 'Local (Port Douglas / Craiglie)', price: 150 },
  { fromKm: 30, toKm: 100, label: 'Cairns region', price: 350 },
  { fromKm: 100, toKm: 250, label: 'Regional (Innisfail / Mission Beach)', price: 650 },
  { fromKm: 250, toKm: 500, label: 'Extended regional (Townsville / Tablelands)', price: 1100 },
  { fromKm: 500, toKm: null, label: 'Long haul — quote per job', price: 1800 },
];

/** Load volume a single vehicle takes, cubic metres. */
export const DEFAULT_VEHICLE_CAPACITY_CUM = 8;

export interface DeliveryQuote {
  distanceKm: number;
  band: DeliveryBand | null;
  loads: number;
  volumeCuM: number;
  /** price for one load at this distance */
  baseprice: number;
  /** baseprice x loads */
  total: number;
  notes: string[];
}

/**
 * Great-circle distance inflated by a road factor. Far North Queensland runs
 * are mostly a single coastal highway, so 1.25 is a reasonable multiplier —
 * for the Craiglie -> Mission Beach run this gives ~185 km against ~200 km by
 * road. Replace with a routing service when one is available.
 */
export function estimateRoadDistanceKm(
  to: { lat: number; lng: number },
  from: { lat: number; lng: number } = WORKSHOP_ORIGIN,
  roadFactor = 1.25,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const straight = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.round(straight * roadFactor * 10) / 10;
}

export function findBand(
  distanceKm: number,
  bands: DeliveryBand[] = DEFAULT_DELIVERY_BANDS,
): DeliveryBand | null {
  return (
    bands.find(
      (b) => distanceKm >= b.fromKm && (b.toKm === null || distanceKm < b.toKm),
    ) ?? null
  );
}

export function calculateDelivery(input: {
  distanceKm: number | null | undefined;
  /** total packed volume of the job, cubic metres */
  volumeCuM?: number;
  bands?: DeliveryBand[];
  vehicleCapacityCuM?: number;
}): DeliveryQuote {
  const notes: string[] = [];
  const bands = input.bands ?? DEFAULT_DELIVERY_BANDS;
  const capacity = input.vehicleCapacityCuM ?? DEFAULT_VEHICLE_CAPACITY_CUM;
  const volumeCuM = Math.max(0, input.volumeCuM ?? 0);

  if (input.distanceKm == null || !Number.isFinite(input.distanceKm)) {
    notes.push('No site distance supplied — delivery not priced.');
    return {
      distanceKm: 0, band: null, loads: 0, volumeCuM,
      baseprice: 0, total: 0, notes,
    } as unknown as DeliveryQuote;
  }

  const distanceKm = Math.max(0, input.distanceKm);
  const band = findBand(distanceKm, bands);
  if (!band) {
    notes.push(`No delivery band covers ${distanceKm} km.`);
    return { distanceKm, band: null, loads: 0, volumeCuM, baseprice: 0, total: 0, notes } as unknown as DeliveryQuote;
  }

  const loads = volumeCuM > 0 ? Math.max(1, Math.ceil(volumeCuM / capacity)) : 1;
  if (loads > 1) {
    notes.push(`${volumeCuM} m³ exceeds one ${capacity} m³ load — ${loads} trips charged.`);
  }
  if (band.toKm === null) {
    notes.push('Beyond the banded range — confirm freight before quoting.');
  }

  return {
    distanceKm,
    band,
    loads,
    volumeCuM,
    baseprice: band.price,
    total: band.price * loads,
    notes,
  } as unknown as DeliveryQuote;
}
