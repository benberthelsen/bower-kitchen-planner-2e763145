import type { RoomDocumentV1, RoomObject } from '@/lib/roomDocument';
import { objectPose, type ObjectPose } from '@/lib/roomDocument/geometry';

export type ExistingObjectVisualKind =
  | 'fridge' | 'catalogued-overhead' | 'proposed-catalogue' | 'overhead-shell' | 'toe-kick' | 'surveyed-volume' | 'footprint-only';

export interface ExistingObjectVisual {
  kind: ExistingObjectVisualKind;
  pose: ObjectPose;
  widthMm: number;
  depthMm: number;
  /** Undefined means the scan has no height; a flat marker is used instead. */
  heightMm?: number;
  elevationMm: number;
  catalogueId?: string;
}

/** A render decision, not a change to measured geometry or catalogue data.
 * Never substitute standard cabinet sizes for missing survey dimensions. */
export function existingObjectVisual(document: RoomDocumentV1, object: RoomObject): ExistingObjectVisual | null {
  const pose = objectPose(document, object);
  if (!pose) return null;
  const base = { pose, widthMm: object.widthMm, depthMm: object.depthMm,
    heightMm: object.heightMm, elevationMm: object.elevationMm ?? 0,
    catalogueId: object.catalogueId };
  if (object.layer === 'proposed' && object.catalogueId && object.heightMm !== undefined
    && /cabinet/i.test(object.kind)) return { ...base, kind: 'proposed-catalogue' };
  if (object.layer !== 'existing' || object.heightMm === undefined) return { ...base, kind: object.heightMm === undefined ? 'footprint-only' : 'surveyed-volume' };
  const kind = object.kind.toLowerCase();
  // The shared fridge model has a minimum physical body size. For an implausibly
  // small observation, retain only its survey volume instead of enlarging it.
  if (/fridge|refrigerator|freezer/.test(kind)) return { ...base,
    kind: object.widthMm >= 200 && object.depthMm >= 200 && object.heightMm >= 300 ? 'fridge' : 'surveyed-volume' };
  if (/overhead|wall[- ]cabinet|upper[- ]cabinet/.test(kind)) {
    // A cabinet model needs both a product identity and a known mounting
    // height. Otherwise show a neutral surveyed shell, not an invented SKU.
    if (object.elevationMm === undefined) return { ...base, kind: 'footprint-only' };
    // CabinetMesh treats y=0 as "use the default wall mounting height". Keep
    // an explicitly recorded zero at floor level in the surveyed shell.
    return { ...base, kind: object.catalogueId && object.elevationMm > 0
      ? 'catalogued-overhead' : 'overhead-shell' };
  }
  if (/toe[- ]kick|kickboard|plinth/.test(kind)) return { ...base, kind: 'toe-kick' };
  return { ...base, kind: 'surveyed-volume' };
}
