/**
 * Hafele Slider SC robe doors - GEOMETRY ONLY. Pure: no catalogue, no money.
 *
 * Source: the Hafele Slider SC installation pages (8 pages, read 17 Sep 2026) and Ben's Microvellum build pack
 * (Source Rules SC-01..SC-17, Validation Tests T01-T10). His pricing program
 * (Hafele_Slider_SC_Pricing_Program.html, calcCabinet / selectedKitLength / trackForLeaf) is the oracle this module is
 * tested against to 0.001 mm.
 *
 * CLOSURE IS PRIMARY. Hafele prints six door-width formulas without parentheses ("ICW - 92 / 2" ...). Read as
 * (sum) / n they all collapse to ONE identity - the leaves together span the opening plus one 60 mm overlap per
 * junction - with a constant per-leaf profile allowance:
 *
 *   leafWidth  = (ICW + 60 x (leaves - 1)) / leaves      (finished leaf, panel + its two vertical profiles)
 *   doorWidth  = leafWidth - allowance                    (the finished panel / infill width, Hafele's "DW")
 *   allowance  = 76 Handle, 7 Slimline                    (42 for Hafele's third profile - not sold here)
 *
 * so (ICW - 92) / 2 = (ICW + 60) / 2 - 76, (ICW - 108) / 3 = (ICW + 120) / 3 - 76, (ICW + 60 - 14) / 2 =
 * (ICW + 60) / 2 - 7 and (ICW + 120 - 21) / 3 = (ICW + 120) / 3 - 7. Ben's app computes DW from the printed formula
 * and ADDS the allowance, which welds the allowance into the numerators: change 76 to a measured 80 and the closure
 * error becomes leaves x 4 mm and the job hard-blocks. Here the allowance moves only the panel cut and the closure
 * stays exactly 0. The printed formula is kept as an assertion (printedDoorWidth / printedFormulaError).
 */

export type SliderScProfile = 'handle' | 'slimline';
export type SliderScFinish = 'silver' | 'black';
export type SliderScLeaves = 2 | 3;
export type SliderScTrack = 'front' | 'rear';

/** SC-01: overlap per junction between adjoining leaves, including the handle width. */
export const SLIDER_SC_OVERLAP_MM = 60;
/** SC-02: door height = IH - 55. */
export const SLIDER_SC_DOOR_HEIGHT_DEDUCTION_MM = 55;
/** SC-03: door height < 2750 mm, STRICT (installation page 3 prints "<2750mm"). */
export const SLIDER_SC_MAX_DOOR_HEIGHT_MM = 2750;
/** SC-04: weight capacity < 50 kg, strict; per door (Build Pack: "brochure clarifies per door"). */
export const SLIDER_SC_MAX_LEAF_KG = 50;
/** DV-01 / DV-02: finished leaf width minus panel width, per leaf. Derived from the closure identity. */
export const SLIDER_SC_PROFILE_ALLOWANCE_MM: Record<SliderScProfile, number> = { handle: 76, slimline: 7 };
/** SC-12: soft-close damper setback G from the side wall. */
export const SLIDER_SC_SOFT_CLOSE_SETBACK_MM: Record<SliderScProfile, number> = { handle: 35, slimline: 0 };
/** SC-17 / Ben 17 Sep 2026: infill 16-18 mm accepted. */
export const SLIDER_SC_MIN_INSERT_MM = 16;
export const SLIDER_SC_MAX_INSERT_MM = 18;
/**
 * Ben's app hard-BLOCKS a finished leaf outside 900-1350 mm. No Hafele page, and no row of his own build pack, gives
 * that range (Validation Test T02 expects a 1380 mm leaf to PASS), so it is a WARNING here. The hard stops are the
 * part-fits-board check and the Hafele height / weight limits.
 */
export const SLIDER_SC_LEAF_WIDTH_WARN_MIN_MM = 900;
export const SLIDER_SC_LEAF_WIDTH_WARN_MAX_MM = 1350;
/** SC-15: soft-close dampers in every kit - 4 for a 2-door AND a 3-door set. */
export const SLIDER_SC_KIT_DAMPERS = 4;
/** His app's closure gate. With closure primary it can only trip on a non-default calibration. */
export const SLIDER_SC_CLOSURE_TOLERANCE_MM = 0.1;

/** Mass model defaults from Ben's app (defaultSettings / blankCabinet) and build pack. Estimates, not measured. */
export const SLIDER_SC_MASS_DEFAULTS = {
  boardDensityKgM3: 700,
  mirrorThicknessMm: 4,
  mirrorDensityKgM3: 2500,
  backerThicknessMm: 12,
  backerDensityKgM3: 650,
  mirrorCoverage: 1,
  /** Profiles, rollers and guides per leaf - an admitted guess in his app ("Measure or certify profile/hardware mass"). */
  profileHardwareKg: 3,
} as const;

/** Nominal kit track length for an opening (Build Pack Kit_Nominal_Length). Inclusive edges; 0 = no packaged kit. */
export function sliderScKitLength(icw: number, leaves: number): 0 | 1800 | 2700 | 3600 {
  if (!Number.isFinite(icw)) return 0;
  if (leaves === 2) return icw <= 1800 ? 1800 : icw <= 2700 ? 2700 : 0;
  if (leaves === 3) return icw <= 2700 ? 2700 : icw <= 3600 ? 3600 : 0;
  return 0;
}

/** Hafele's printed door-width formula (installation page 3), read as (numerator) / leaves. */
export function hafelePrintedDoorWidth(profile: SliderScProfile, leaves: number, icw: number): number {
  if (profile === 'handle' && leaves === 2) return (icw - 92) / 2;
  if (profile === 'handle' && leaves === 3) return (icw - 108) / 3;
  if (profile === 'slimline' && leaves === 2) return (icw + 60 - 14) / 2;
  if (profile === 'slimline' && leaves === 3) return (icw + 120 - 21) / 3;
  return NaN;
}

/**
 * Which track plane a leaf runs on (installation page 1 and the page 3 plans): 2 doors - leaf 1 front, leaf 2 rear
 * (Ben's app offers the reverse stack as an option); 3 doors - the centre leaf rear, the outer two front.
 */
export function sliderScTrackForLeaf(leaves: number, leaf: number, reverseTwoDoorStack = false): SliderScTrack {
  if (leaves === 3) return leaf === 2 ? 'rear' : 'front';
  if (reverseTwoDoorStack) return leaf === 1 ? 'rear' : 'front';
  return leaf === 1 ? 'front' : 'rear';
}

/** Normalise a profile from the contract ('handle') or from Ben's app ('Handle'). */
export function normaliseSliderScProfile(v: unknown): SliderScProfile | null {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'handle' ? 'handle' : s === 'slimline' ? 'slimline' : null;
}

/** Normalise a finish from the contract ('silver') or from Ben's app ('Silver anodised'). */
export function normaliseSliderScFinish(v: unknown): SliderScFinish | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (/^silver\b/.test(s)) return 'silver';
  if (/^black\b/.test(s)) return 'black';
  return null;
}

export interface SliderScAllowances {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

/**
 * Cut calibration from a physical mock-up. All default 0 / the derived allowance. Changing profileAllowance moves the
 * panel cut and the horizontal profile cut only; the closure stays exact. The *Add fields are Ben's app's
 * calibration adds with the same meaning.
 */
export interface SliderScCalibration {
  profileAllowance?: number;
  infillWidthAdd?: number;
  infillHeightAdd?: number;
  trackLengthAdd?: number;
  verticalProfileAdd?: number;
  horizontalProfileAdd?: number;
}

export interface SliderScGeometryInput {
  profile: SliderScProfile;
  leaves: number;
  /** measured opening, mm */
  openingWidth: number;
  openingHeight: number;
  /** positive deductions, mm, default 0 */
  allowances?: SliderScAllowances;
  calibration?: SliderScCalibration;
}

export interface SliderScGeometry {
  profile: SliderScProfile;
  leaves: number;
  /** clear internal width / height after allowances */
  icw: number;
  ih: number;
  /** finished leaf (panel + vertical profiles) */
  leafWidth: number;
  profileAllowance: number;
  /** Hafele DW: the panel width before any infill calibration add */
  doorWidth: number;
  /** IH - 55 */
  doorHeight: number;
  /** |leaves x leafWidth - (leaves - 1) x 60 - icw| - 0 by construction */
  closureError: number;
  /** Hafele's printed formula for this profile / leaf count, and its difference from doorWidth (0 at the default allowance) */
  printedDoorWidth: number;
  printedFormulaError: number;
  /** top track E and bottom rail F cut length */
  trackCut: number;
  /** 2 per leaf (H or I profile) */
  verticalProfileCut: number;
  /** 2 per leaf (top and bottom) */
  horizontalProfileCut: number;
  /**
   * Infill panel per leaf at its FINISHED size - what the profile channel holds (DW x door height, plus any
   * calibration add). Pure geometry knows no edge tape: an edged board panel is cut smaller by the tape on each edged
   * side, and robeSliderDoors / quoteFromSchedule report that saw size as `panelCut` next to `panelFinished`.
   */
  panelCut: { w: number; h: number };
  verticalProfiles: number;
  horizontalProfiles: number;
  /** 0 when no packaged kit covers the opening */
  kitLength: 0 | 1800 | 2700 | 3600;
  softCloseSetback: number;
  tracks: SliderScTrack[];
  /** Hard stops: geometry that cannot be made or is outside a Hafele limit. */
  blocks: string[];
  /** Everything else worth saying (the unsourced 900-1350 mm leaf range). */
  warnings: string[];
}

const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const numOr = (v: unknown, d: number) => (fin(v) ? v : d);
const mm = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));
/** Round a sum of measured sizes to 1e-6 mm (NaN stays NaN), so float noise never crosses a kit or height boundary. */
export const snapMm = (n: number) => Math.round(n * 1e6) / 1e6;

export function sliderScGeometry(input: SliderScGeometryInput): SliderScGeometry {
  const blocks: string[] = [];
  const warnings: string[] = [];
  const profile = input.profile;
  const leaves = input.leaves;
  const a = input.allowances ?? {};
  const left = numOr(a.left, 0);
  const right = numOr(a.right, 0);
  const top = numOr(a.top, 0);
  const bottom = numOr(a.bottom, 0);
  const cal = input.calibration ?? {};

  if (!fin(input.openingWidth) || !fin(input.openingHeight) || input.openingWidth <= 0 || input.openingHeight <= 0) {
    blocks.push(`measured opening ${input.openingWidth} x ${input.openingHeight} mm must be positive`);
  }
  if (left < 0 || right < 0 || top < 0 || bottom < 0) blocks.push('opening allowances cannot be negative (they are deductions)');
  if (leaves !== 2 && leaves !== 3) blocks.push(`leaves must be 2 or 3 (got ${leaves})`);
  if (profile !== 'handle' && profile !== 'slimline') blocks.push(`profile must be handle or slimline (got ${profile})`);

  // Snapped to 1e-6 mm before any comparison: a measured 2700.3 less 0.1 and 0.2 is 2700.0000000000005 in floating
  // point, which lost the 2700 kit, and 2805.6 less 0.3 twice made a 2749.9999999999995 door that dodged the 2750 stop.
  const icw = snapMm(numOr(input.openingWidth, NaN) - left - right);
  const ih = snapMm(numOr(input.openingHeight, NaN) - top - bottom);
  const allowance = numOr(cal.profileAllowance, SLIDER_SC_PROFILE_ALLOWANCE_MM[profile] ?? NaN);
  const leafWidth = (icw + SLIDER_SC_OVERLAP_MM * (leaves - 1)) / leaves;
  const doorWidth = leafWidth - allowance;
  const doorHeight = ih - SLIDER_SC_DOOR_HEIGHT_DEDUCTION_MM;
  const closureError = Math.abs(leaves * leafWidth - (leaves - 1) * SLIDER_SC_OVERLAP_MM - icw);
  const printedDoorWidth = hafelePrintedDoorWidth(profile, leaves, icw);
  const printedFormulaError = Math.abs(printedDoorWidth - doorWidth);

  const panelW = doorWidth + numOr(cal.infillWidthAdd, 0);
  const panelH = doorHeight + numOr(cal.infillHeightAdd, 0);
  const trackCut = icw + numOr(cal.trackLengthAdd, 0);
  const verticalProfileCut = doorHeight + numOr(cal.verticalProfileAdd, 0);
  const horizontalProfileCut = doorWidth + numOr(cal.horizontalProfileAdd, 0);
  const kitLength = sliderScKitLength(icw, leaves);

  if (blocks.length === 0) {
    if (!(icw > 0) || !(ih > 0)) blocks.push(`clear opening ${mm(icw)} x ${mm(ih)} mm must stay positive after allowances`);
    if (!(doorWidth > 0)) blocks.push(`door (panel) width ${mm(doorWidth)} mm must be positive`);
    if (!(doorHeight > 0)) blocks.push(`door height ${mm(doorHeight)} mm (IH ${mm(ih)} - 55) must be positive`);
    if (doorHeight >= SLIDER_SC_MAX_DOOR_HEIGHT_MM) {
      blocks.push(`door height ${mm(doorHeight)} mm (IH ${mm(ih)} - 55) is not under Hafele's ${SLIDER_SC_MAX_DOOR_HEIGHT_MM} mm limit (installation page 3: "Door Height: <2750mm", so IH must be under 2805 mm)`);
    }
    if (!(panelW > 0) || !(panelH > 0)) blocks.push('calibrated infill cut must be positive');
    if (!(trackCut > 0) || !(verticalProfileCut > 0) || !(horizontalProfileCut > 0)) blocks.push('calibrated track and profile cuts must be positive');
    if (kitLength === 0) {
      const hint = leaves === 2 && icw <= 3600 ? ' - a 2-leaf kit stops at 2700 mm; three leaves on the 3600 mm kit covers it' : '';
      blocks.push(`no packaged Slider SC kit covers a ${mm(icw)} mm clear width with ${leaves} leaves (2 leaves up to 2700 mm, 3 leaves up to 3600 mm)${hint}`);
    } else if (trackCut > kitLength + SLIDER_SC_CLOSURE_TOLERANCE_MM) {
      blocks.push(`track cut ${mm(trackCut)} mm is longer than the ${kitLength} mm kit track`);
    }
    if (closureError > SLIDER_SC_CLOSURE_TOLERANCE_MM) blocks.push(`leaf closure error ${closureError.toFixed(3)} mm exceeds 0.1 mm`);
    if (leafWidth < SLIDER_SC_LEAF_WIDTH_WARN_MIN_MM || leafWidth > SLIDER_SC_LEAF_WIDTH_WARN_MAX_MM) {
      warnings.push(`finished leaf ${mm(leafWidth)} mm is outside 900-1350 mm - Ben's app blocks that range, but no Hafele page or build-pack rule gives it (source unknown); priced, check the leaf width is right`);
    }
  }

  const tracks: SliderScTrack[] = [];
  if (leaves === 2 || leaves === 3) for (let leaf = 1; leaf <= leaves; leaf++) tracks.push(sliderScTrackForLeaf(leaves, leaf));

  return {
    profile, leaves, icw, ih, leafWidth, profileAllowance: allowance, doorWidth, doorHeight, closureError,
    printedDoorWidth, printedFormulaError, trackCut, verticalProfileCut, horizontalProfileCut,
    panelCut: { w: panelW, h: panelH },
    verticalProfiles: 2 * leaves, horizontalProfiles: 2 * leaves,
    kitLength, softCloseSetback: SLIDER_SC_SOFT_CLOSE_SETBACK_MM[profile] ?? 0, tracks, blocks, warnings,
  };
}

export interface SliderScMassInput {
  panelW: number;
  panelH: number;
  infill: 'board' | 'mirror';
  boardThicknessMm?: number;
  boardDensityKgM3?: number;
  mirrorThicknessMm?: number;
  mirrorDensityKgM3?: number;
  backerThicknessMm?: number;
  backerDensityKgM3?: number;
  mirrorCoverage?: number;
  profileHardwareKg?: number;
}

/** Estimated leaf mass, kg - Ben's app / build pack Insert_Mass + Profile_Hardware_Mass. An ESTIMATE. */
export function sliderScLeafMassKg(m: SliderScMassInput): number {
  const d = SLIDER_SC_MASS_DEFAULTS;
  const area = (m.panelW * m.panelH) / 1e6;
  const insert = m.infill === 'board'
    ? area * (numOr(m.boardThicknessMm, 16) / 1000) * numOr(m.boardDensityKgM3, d.boardDensityKgM3)
    : area * numOr(m.mirrorCoverage, d.mirrorCoverage) * (numOr(m.mirrorThicknessMm, d.mirrorThicknessMm) / 1000) * numOr(m.mirrorDensityKgM3, d.mirrorDensityKgM3)
      + area * (numOr(m.backerThicknessMm, d.backerThicknessMm) / 1000) * numOr(m.backerDensityKgM3, d.backerDensityKgM3);
  return insert + numOr(m.profileHardwareKg, d.profileHardwareKg);
}

/**
 * The build pack's Validation_Status formula, verbatim:
 * AND(Door_Height < 2750, 16 <= Insert_Thickness <= 18, Estimated_Leaf_Weight < 50, Kit_Nominal_Length > 0, Closure_Error <= 0.1).
 */
export function sliderScValidationStatus(g: SliderScGeometry, insertThicknessMm: number, leafMassKg: number): 'GEOMETRY PASS' | 'BLOCKED' {
  const ok = g.doorHeight < SLIDER_SC_MAX_DOOR_HEIGHT_MM
    && insertThicknessMm >= SLIDER_SC_MIN_INSERT_MM && insertThicknessMm <= SLIDER_SC_MAX_INSERT_MM
    && leafMassKg < SLIDER_SC_MAX_LEAF_KG
    && g.kitLength > 0
    && g.closureError <= SLIDER_SC_CLOSURE_TOLERANCE_MM;
  return ok ? 'GEOMETRY PASS' : 'BLOCKED';
}
