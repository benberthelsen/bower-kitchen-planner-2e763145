import { capabilitiesAreMapped, unmappedCapabilities, type CatalogCapabilityId } from './catalogCapabilities';
import type { KitchenSpec, Run, Segment, StyleSpec } from './types';

export const STYLE_FAMILY_IDS = [
  'classic-white', 'hamptons', 'scandinavian', 'coastal', 'warm-timber', 'modern-dark',
  'japandi', 'industrial', 'contemporary', 'minimalist', 'traditional', 'farmhouse',
  'mid-century', 'mediterranean', 'french-provincial', 'eclectic',
] as const;

export type StyleFamilyId = typeof STYLE_FAMILY_IDS[number];
export type DoorProfile = 'slab' | 'slim-shaker' | 'shaker-profiled';
export type StorageCharacter = 'closed-formal' | 'concealed-minimal' | 'mixed' | 'open-relaxed';
export type TallUnitMassing = 'clustered-end' | 'dedicated-tall-wall' | 'limited';
export type CornerTreatment = 'bifold-corner' | 'blind-corner' | 'carousel' | 'walk-in-pantry' | 'explicit-void';

export interface StyleVariantDNA {
  id: 'balanced' | 'lighter' | 'storage';
  name: string;
  overheadAdjustment: number;
  shelvingAdjustment: number;
}

export interface StyleReferenceReview {
  status: 'pending-bower-review' | 'approved';
  version: number;
  requiredReferenceCount: 5;
  reviewer?: string;
  signedOffAt?: string;
  checklist: readonly {
    trait: 'overhead-coverage' | 'open-shelving' | 'feature-elements' | 'massing' | 'storage-character';
    outcome: 'pending' | 'confirmed' | 'adjusted';
    note: string;
  }[];
}

export interface StyleDNAProfile {
  id: StyleFamilyId;
  name: string;
  version: number;
  activationPhase: 'launch' | 'future';
  description: string;
  doorProfile: DoorProfile;
  overheadCoverage: { min: number; target: number; max: number };
  openShelvingRatio: { min: number; target: number; max: number };
  requiredFeatureElements: readonly string[];
  preferredFeatureElements: readonly string[];
  cornerTreatmentPreference: readonly CornerTreatment[];
  tallUnitMassing: TallUnitMassing;
  storageCharacter: StorageCharacter;
  permittedMaterialFamilies: readonly string[];
  mandatoryCapabilities: readonly CatalogCapabilityId[];
  variants: readonly StyleVariantDNA[];
  referenceReview: StyleReferenceReview;
  /** Existing material selection used by the offline/static catalogue. */
  defaultStyle: Omit<StyleSpec, 'familyId' | 'familyVersion' | 'variantId' | 'doorProfile' | 'compositionFeatureIds'>;
}

const variants: readonly StyleVariantDNA[] = Object.freeze([
  { id: 'balanced', name: 'Balanced', overheadAdjustment: 0, shelvingAdjustment: 0 },
  { id: 'lighter', name: 'Lighter', overheadAdjustment: -0.18, shelvingAdjustment: 0.12 },
  { id: 'storage', name: 'Storage', overheadAdjustment: 0.18, shelvingAdjustment: -0.12 },
]);

const pendingReview = (): StyleReferenceReview => ({
  status: 'pending-bower-review',
  version: 1,
  requiredReferenceCount: 5,
  checklist: [
    { trait: 'overhead-coverage', outcome: 'pending', note: 'Check composition against at least five external references.' },
    { trait: 'open-shelving', outcome: 'pending', note: 'Confirm the ratio, not the colour palette.' },
    { trait: 'feature-elements', outcome: 'pending', note: 'Confirm required and excluded architectural elements.' },
    { trait: 'massing', outcome: 'pending', note: 'Confirm tall-unit and island massing.' },
    { trait: 'storage-character', outcome: 'pending', note: 'Confirm open versus concealed storage character.' },
  ],
});

type Seed = Omit<StyleDNAProfile, 'version' | 'activationPhase' | 'variants' | 'referenceReview'>;
const define = (seed: Seed, activationPhase: 'launch' | 'future' = 'future'): StyleDNAProfile => Object.freeze({
  ...seed,
  version: 1,
  activationPhase,
  variants,
  referenceReview: pendingReview(),
});

export const STYLE_DNA: Readonly<Record<StyleFamilyId, StyleDNAProfile>> = Object.freeze({
  'classic-white': define({
    id: 'classic-white', name: 'Classic White', description: 'Bright, orderly and storage-forward with a generous overhead rhythm.',
    doorProfile: 'slab', overheadCoverage: { min: .62, target: .76, max: .9 },
    openShelvingRatio: { min: 0, target: 0, max: .08 }, requiredFeatureElements: [],
    preferredFeatureElements: ['symmetrical-overheads'], cornerTreatmentPreference: ['bifold-corner', 'blind-corner', 'carousel'],
    tallUnitMassing: 'clustered-end', storageCharacter: 'closed-formal',
    permittedMaterialFamilies: ['white', 'soft-grey', 'light-stone'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'bifold-corner-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-classic-white', benchtopId: 'egger-premium-white', handleId: 'handle-bar-ss' },
  }, 'launch'),
  hamptons: define({
    id: 'hamptons', name: 'Hamptons', description: 'Formal profiled cabinetry with full overheads, crown detail and pillar ends.',
    doorProfile: 'shaker-profiled', overheadCoverage: { min: .78, target: .92, max: 1 },
    openShelvingRatio: { min: 0, target: 0, max: .05 }, requiredFeatureElements: ['crown-moulding', 'pillar-ends'],
    preferredFeatureElements: ['symmetrical-overheads', 'feature-rangehood'], cornerTreatmentPreference: ['bifold-corner', 'blind-corner', 'carousel'],
    tallUnitMassing: 'clustered-end', storageCharacter: 'closed-formal',
    permittedMaterialFamilies: ['white', 'soft-grey', 'marble-look'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'bifold-corner-cabinet', 'shaker-door-profile', 'crown-moulding', 'pillar-end'],
    defaultStyle: { finishId: 'do-classic-white', benchtopId: 'egger-white-carrara', handleId: 'handle-knob-ss' },
  }, 'launch'),
  scandinavian: define({
    id: 'scandinavian', name: 'Scandinavian', description: 'Clean unbroken lines, selective overheads and restrained open accents.',
    doorProfile: 'slab', overheadCoverage: { min: .22, target: .38, max: .55 },
    openShelvingRatio: { min: .05, target: .18, max: .32 }, requiredFeatureElements: [],
    preferredFeatureElements: ['natural-timber-accent', 'clean-lines'], cornerTreatmentPreference: ['bifold-corner', 'blind-corner', 'explicit-void'],
    tallUnitMassing: 'clustered-end', storageCharacter: 'concealed-minimal',
    permittedMaterialFamilies: ['natural-oak', 'white', 'pale-timber'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'open-wall-cabinet', 'bifold-corner-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-natural-oak', benchtopId: 'egger-premium-white', handleId: 'handle-none' },
  }, 'launch'),
  coastal: define({
    id: 'coastal', name: 'Coastal / Beach', description: 'Open, relaxed massing with few overheads and clearly visible open shelving.',
    doorProfile: 'slab', overheadCoverage: { min: .12, target: .26, max: .42 },
    openShelvingRatio: { min: .45, target: .66, max: .9 }, requiredFeatureElements: ['open-shelving'],
    preferredFeatureElements: ['light-open-massing'], cornerTreatmentPreference: ['bifold-corner', 'blind-corner', 'explicit-void'],
    tallUnitMassing: 'limited', storageCharacter: 'open-relaxed',
    permittedMaterialFamilies: ['white', 'light-timber', 'textured-neutral'],
    mandatoryCapabilities: ['base-cabinet', 'open-wall-cabinet', 'bifold-corner-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-designer-white', benchtopId: 'egger-white-carrara', handleId: 'handle-bar-ss' },
  }, 'launch'),
  'warm-timber': define({
    id: 'warm-timber', name: 'Warm Timber', description: 'Layered timber, mixed storage and a composed tall-unit wall.',
    doorProfile: 'slab', overheadCoverage: { min: .38, target: .56, max: .72 },
    openShelvingRatio: { min: .08, target: .2, max: .35 }, requiredFeatureElements: [],
    preferredFeatureElements: ['natural-timber-accent', 'statement-island'], cornerTreatmentPreference: ['bifold-corner', 'blind-corner', 'carousel'],
    tallUnitMassing: 'dedicated-tall-wall', storageCharacter: 'mixed',
    permittedMaterialFamilies: ['spotted-gum', 'natural-oak', 'warm-neutral'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'open-wall-cabinet', 'bifold-corner-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-spotted-gum', benchtopId: 'egger-halifax-oak-nat', handleId: 'handle-bar-go' },
  }, 'launch'),
  'modern-dark': define({
    id: 'modern-dark', name: 'Modern Dark', description: 'Strong monolithic massing with concealed storage and a dedicated tall wall.',
    doorProfile: 'slab', overheadCoverage: { min: .5, target: .68, max: .82 },
    openShelvingRatio: { min: 0, target: .04, max: .12 }, requiredFeatureElements: [],
    preferredFeatureElements: ['monolithic-tall-wall', 'statement-island'], cornerTreatmentPreference: ['bifold-corner', 'blind-corner'],
    tallUnitMassing: 'dedicated-tall-wall', storageCharacter: 'concealed-minimal',
    permittedMaterialFamilies: ['charcoal', 'black', 'dark-timber'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'bifold-corner-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-charcoal', benchtopId: 'egger-black', handleId: 'handle-bar-bk' },
  }, 'launch'),
  japandi: define({
    id: 'japandi', name: 'Japandi', description: 'Low visual noise, natural texture and a small number of deliberate open elements.',
    doorProfile: 'slab', overheadCoverage: { min: .2, target: .34, max: .5 }, openShelvingRatio: { min: .08, target: .22, max: .36 },
    requiredFeatureElements: [], preferredFeatureElements: ['natural-timber-accent'], cornerTreatmentPreference: ['explicit-void', 'blind-corner'],
    tallUnitMassing: 'limited', storageCharacter: 'concealed-minimal', permittedMaterialFamilies: ['natural-oak', 'warm-white', 'stone'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'open-wall-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-natural-oak', benchtopId: 'egger-halifax-oak-nat', handleId: 'handle-lip-ss' },
  }),
  industrial: define({
    id: 'industrial', name: 'Industrial', description: 'Robust dark massing, functional open storage and strong horizontal runs.',
    doorProfile: 'slab', overheadCoverage: { min: .3, target: .48, max: .65 }, openShelvingRatio: { min: .16, target: .32, max: .5 },
    requiredFeatureElements: [], preferredFeatureElements: ['metal-open-shelf'], cornerTreatmentPreference: ['blind-corner', 'explicit-void'],
    tallUnitMassing: 'dedicated-tall-wall', storageCharacter: 'mixed', permittedMaterialFamilies: ['charcoal', 'concrete', 'dark-timber'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'open-wall-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-stone-grey', benchtopId: 'egger-concrete-chicago-dark', handleId: 'handle-bar-bk' },
  }),
  contemporary: define({
    id: 'contemporary', name: 'Contemporary', description: 'Balanced asymmetry, selective overheads and an integrated tall wall.',
    doorProfile: 'slab', overheadCoverage: { min: .4, target: .58, max: .74 }, openShelvingRatio: { min: .04, target: .12, max: .24 },
    requiredFeatureElements: [], preferredFeatureElements: ['integrated-tall-wall'], cornerTreatmentPreference: ['blind-corner'],
    tallUnitMassing: 'dedicated-tall-wall', storageCharacter: 'concealed-minimal', permittedMaterialFamilies: ['neutral', 'timber', 'stone'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'open-wall-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-stone-grey', benchtopId: 'egger-premium-white', handleId: 'handle-lip-ss' },
  }),
  minimalist: define({
    id: 'minimalist', name: 'Minimalist', description: 'Sparse overheads, concealed storage and uninterrupted planes.',
    doorProfile: 'slab', overheadCoverage: { min: .12, target: .25, max: .4 }, openShelvingRatio: { min: 0, target: .04, max: .1 },
    requiredFeatureElements: [], preferredFeatureElements: ['clean-lines'], cornerTreatmentPreference: ['explicit-void', 'blind-corner'],
    tallUnitMassing: 'dedicated-tall-wall', storageCharacter: 'concealed-minimal', permittedMaterialFamilies: ['white', 'neutral', 'monochrome'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-designer-white', benchtopId: 'egger-premium-white', handleId: 'handle-none' },
  }),
  traditional: define({
    id: 'traditional', name: 'Traditional', description: 'Profiled, symmetrical and closed-storage led.',
    doorProfile: 'shaker-profiled', overheadCoverage: { min: .72, target: .86, max: 1 }, openShelvingRatio: { min: 0, target: 0, max: .06 },
    requiredFeatureElements: ['crown-moulding'], preferredFeatureElements: ['symmetrical-overheads'], cornerTreatmentPreference: ['carousel', 'blind-corner'],
    tallUnitMassing: 'clustered-end', storageCharacter: 'closed-formal', permittedMaterialFamilies: ['white', 'cream', 'timber'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'shaker-door-profile', 'crown-moulding'],
    defaultStyle: { finishId: 'do-classic-white', benchtopId: 'egger-white-carrara', handleId: 'handle-knob-ss' },
  }),
  farmhouse: define({
    id: 'farmhouse', name: 'Farmhouse', description: 'Shaker cabinetry, practical open shelves and furniture-like storage.',
    doorProfile: 'shaker-profiled', overheadCoverage: { min: .45, target: .62, max: .78 }, openShelvingRatio: { min: .18, target: .32, max: .48 },
    requiredFeatureElements: ['open-shelving'], preferredFeatureElements: ['feature-rangehood'], cornerTreatmentPreference: ['carousel', 'blind-corner'],
    tallUnitMassing: 'clustered-end', storageCharacter: 'mixed', permittedMaterialFamilies: ['warm-white', 'timber', 'stone'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'open-wall-cabinet', 'shaker-door-profile'],
    defaultStyle: { finishId: 'do-classic-white', benchtopId: 'egger-white-carrara', handleId: 'handle-knob-ss' },
  }),
  'mid-century': define({
    id: 'mid-century', name: 'Mid-century', description: 'Timber planes, long low runs and selective upper storage.',
    doorProfile: 'slab', overheadCoverage: { min: .2, target: .38, max: .55 }, openShelvingRatio: { min: .12, target: .26, max: .4 },
    requiredFeatureElements: [], preferredFeatureElements: ['horizontal-massing'], cornerTreatmentPreference: ['explicit-void', 'blind-corner'],
    tallUnitMassing: 'limited', storageCharacter: 'mixed', permittedMaterialFamilies: ['walnut', 'warm-timber', 'muted-colour'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'open-wall-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-spotted-gum', benchtopId: 'egger-premium-white', handleId: 'handle-lip-ss' },
  }),
  mediterranean: define({
    id: 'mediterranean', name: 'Mediterranean', description: 'Textural open display, grounded massing and a furniture-like island.',
    doorProfile: 'slim-shaker', overheadCoverage: { min: .28, target: .44, max: .62 }, openShelvingRatio: { min: .25, target: .42, max: .6 },
    requiredFeatureElements: ['open-shelving'], preferredFeatureElements: ['statement-island'], cornerTreatmentPreference: ['carousel', 'blind-corner'],
    tallUnitMassing: 'limited', storageCharacter: 'open-relaxed', permittedMaterialFamilies: ['warm-white', 'terracotta', 'natural-timber'],
    mandatoryCapabilities: ['base-cabinet', 'open-wall-cabinet', 'slim-shaker-door-profile'],
    defaultStyle: { finishId: 'do-designer-white', benchtopId: 'egger-halifax-oak-nat', handleId: 'handle-knob-ss' },
  }),
  'french-provincial': define({
    id: 'french-provincial', name: 'French Provincial', description: 'Detailed profiled fronts, formal overheads and furniture ends.',
    doorProfile: 'shaker-profiled', overheadCoverage: { min: .72, target: .88, max: 1 }, openShelvingRatio: { min: 0, target: .04, max: .1 },
    requiredFeatureElements: ['crown-moulding', 'pillar-ends'], preferredFeatureElements: ['feature-rangehood'], cornerTreatmentPreference: ['carousel'],
    tallUnitMassing: 'clustered-end', storageCharacter: 'closed-formal', permittedMaterialFamilies: ['cream', 'white', 'soft-grey'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'shaker-door-profile', 'crown-moulding', 'pillar-end'],
    defaultStyle: { finishId: 'do-classic-white', benchtopId: 'egger-white-carrara', handleId: 'handle-knob-ss' },
  }),
  eclectic: define({
    id: 'eclectic', name: 'Eclectic', description: 'Deliberately mixed storage, asymmetric uppers and a feature element.',
    doorProfile: 'slab', overheadCoverage: { min: .3, target: .5, max: .7 }, openShelvingRatio: { min: .18, target: .36, max: .55 },
    requiredFeatureElements: [], preferredFeatureElements: ['asymmetrical-overheads', 'statement-island'], cornerTreatmentPreference: ['blind-corner', 'explicit-void'],
    tallUnitMassing: 'clustered-end', storageCharacter: 'mixed', permittedMaterialFamilies: ['mixed', 'colour', 'timber'],
    mandatoryCapabilities: ['base-cabinet', 'closed-wall-cabinet', 'open-wall-cabinet', 'slab-door-profile'],
    defaultStyle: { finishId: 'do-stone-grey', benchtopId: 'egger-halifax-oak-nat', handleId: 'handle-bar-go' },
  }),
});

export interface StyleActivationStatus {
  familyId: StyleFamilyId;
  catalogMapped: boolean;
  humanReviewApproved: boolean;
  releaseReady: boolean;
  blockers: string[];
}

export function styleActivationStatus(profile: StyleDNAProfile): StyleActivationStatus {
  const missing = unmappedCapabilities(profile.mandatoryCapabilities);
  const humanReviewApproved = profile.referenceReview.status === 'approved';
  return {
    familyId: profile.id,
    catalogMapped: missing.length === 0,
    humanReviewApproved,
    releaseReady: profile.activationPhase === 'launch' && missing.length === 0 && humanReviewApproved,
    blockers: [
      ...missing.map(capability => `${capability.label}: ${capability.note ?? 'not mapped'}`),
      ...(humanReviewApproved ? [] : ['Bower five-reference composition review is not signed off']),
      ...(profile.activationPhase === 'launch' ? [] : ['Family is defined for a later activation phase']),
    ],
  };
}

/** Working-preview families may be inspected before human sign-off; release UI may not expose them. */
export function previewStyleFamilies(): StyleDNAProfile[] {
  return STYLE_FAMILY_IDS.map(id => STYLE_DNA[id]).filter(profile =>
    profile.activationPhase === 'launch' && capabilitiesAreMapped(profile.mandatoryCapabilities));
}

export function releasedStyleFamilies(): StyleDNAProfile[] {
  return STYLE_FAMILY_IDS.map(id => STYLE_DNA[id]).filter(profile => styleActivationStatus(profile).releaseReady);
}

export function styleProfile(id: string | undefined): StyleDNAProfile | null {
  return id && STYLE_FAMILY_IDS.includes(id as StyleFamilyId) ? STYLE_DNA[id as StyleFamilyId] : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isTall(segment: Segment): boolean {
  return segment.kind === 'cabinet'
    && ['pantry', 'oven-tower', 'fridge-gap', 'fridge-corner-pantry'].includes(segment.role);
}

function isEdgeProtection(segment: Segment): boolean {
  return segment.kind === 'filler'
    || (segment.kind === 'cabinet'
      && (segment.role === 'corner' || segment.role === 'corner-buffer'));
}

function tallClusterForStart(tall: Segment[]): Segment[] {
  const fridge = tall.filter(segment => segment.kind === 'cabinet' && segment.role === 'fridge-gap');
  const otherTall = tall.filter(segment => !(segment.kind === 'cabinet' && segment.role === 'fridge-gap'));
  return [...otherTall, ...fridge];
}

function tallClusterForEnd(tall: Segment[]): Segment[] {
  const fridge = tall.filter(segment => segment.kind === 'cabinet' && segment.role === 'fridge-gap');
  const otherTall = tall.filter(segment => !(segment.kind === 'cabinet' && segment.role === 'fridge-gap'));
  return [...fridge, ...otherTall];
}

function normalizeTallMassing(run: Run, massing: TallUnitMassing): Run {
  // "Limited" controls the visual massing and prevents storage variants from
  // adding extra tall units; it must not erase the one functional pantry most
  // clients expect. The default generator already omits that pantry when the
  // measured cabinet runs are genuinely too small.
  const segments = [...run.segments];
  const tall = segments.filter(isTall);
  const rest = segments.filter(segment => !isTall(segment));
  if (tall.length === 0) return { ...run, segments };
  const leadingProtection: Segment[] = [];
  for (const segment of segments) {
    if (!isEdgeProtection(segment)) break;
    leadingProtection.push(segment);
  }
  const trailingProtection: Segment[] = [];
  for (let index = segments.length - 1; index >= leadingProtection.length; index--) {
    if (!isEdgeProtection(segments[index])) break;
    trailingProtection.unshift(segments[index]);
  }
  const protectedSegments = new Set([...leadingProtection, ...trailingProtection]);
  const workingRest = rest.filter(segment => !protectedSegments.has(segment));

  // Edge protection is geometry, not styling. Keep it against the room wall
  // and keep the fridge on the bench-facing edge of its tall-unit cluster.
  if (leadingProtection.length > 0) {
    const onlyTallIsHousedFridge = tall.length === 1
      && tall[0].kind === 'cabinet'
      && tall[0].role === 'fridge-gap'
      && run.wallCabinets === true;
    const leadingProtectionIsOnlyScribe = leadingProtection.every(segment => segment.kind === 'filler');
    if (onlyTallIsHousedFridge && leadingProtectionIsOnlyScribe) {
      // Style massing moved the housed fridge from the opposite wall end to
      // this end. Its reserved opening already owns the wall-side clearance,
      // so move the ordinary scribe to the now-exposed end of the low run.
      return {
        ...run,
        segments: [
          ...tallClusterForStart(tall),
          ...workingRest,
          ...leadingProtection,
          ...trailingProtection,
        ],
      };
    }
    return {
      ...run,
      segments: [
        ...leadingProtection,
        ...tallClusterForStart(tall),
        ...workingRest,
        ...trailingProtection,
      ],
    };
  }
  if (trailingProtection.length > 0) {
    return {
      ...run,
      segments: [
        ...leadingProtection,
        ...workingRest,
        ...tallClusterForEnd(tall),
        ...trailingProtection,
      ],
    };
  }
  const tallIndexes = segments.map((segment, index) => isTall(segment) ? index : -1).filter(index => index >= 0);
  const alreadyAtStart = tallIndexes.every((index, offset) => index === offset);
  const alreadyAtEnd = tallIndexes.every((index, offset) => index === segments.length - tallIndexes.length + offset);
  if (alreadyAtStart) return { ...run, segments: [...tallClusterForStart(tall), ...rest] };
  if (alreadyAtEnd) return { ...run, segments: [...rest, ...tallClusterForEnd(tall)] };
  const hasCornerAtStart = rest[0]?.kind === 'cabinet' && rest[0].role === 'corner';
  return {
    ...run,
    segments: hasCornerAtStart
      ? [...rest, ...tallClusterForEnd(tall)]
      : [...tallClusterForStart(tall), ...rest],
  };
}

/** Apply structural Style DNA without inventing any catalogue product. */
export function applyStyleDNA(spec: KitchenSpec): KitchenSpec {
  const profile = styleProfile(spec.style.familyId);
  if (!profile) return spec;
  const variant = profile.variants.find(item => item.id === spec.style.variantId) ?? profile.variants[0];
  const coverage = clamp(
    profile.overheadCoverage.target + variant.overheadAdjustment,
    profile.overheadCoverage.min,
    profile.overheadCoverage.max,
  );
  const shelving = clamp(
    profile.openShelvingRatio.target + variant.shelvingAdjustment,
    profile.openShelvingRatio.min,
    profile.openShelvingRatio.max,
  );

  const normalizedRuns = spec.runs.map(sourceRun =>
    normalizeTallMassing(sourceRun, profile.tallUnitMassing));
  const upperEligibleRunIndexes = normalizedRuns
    .map((run, index) => run.wallCabinets ? index : -1)
    .filter(index => index >= 0);
  const cooktopRunIndex = normalizedRuns.findIndex(run => run.segments.some(segment =>
    segment.kind === 'cabinet' && segment.role === 'cooktop'));
  const hasTallBank = (run: Run) => run.segments.some(segment => segment.kind === 'cabinet'
    && ['pantry', 'oven-tower', 'fridge-gap'].includes(segment.role));
  const upperPriority = [...upperEligibleRunIndexes].sort((a, b) => {
    if (a === cooktopRunIndex) return -1;
    if (b === cooktopRunIndex) return 1;
    // After completing the cooking wall, return the upper row toward the tall
    // bank. This creates an intentional end at the pantry/oven gable instead
    // of spending limited Scandinavian/Coastal overheads on an isolated sink
    // return or an inaccessible cabinet hard into a room corner.
    if (hasTallBank(normalizedRuns[a]) !== hasTallBank(normalizedRuns[b])) {
      return hasTallBank(normalizedRuns[a]) ? -1 : 1;
    }
    return a - b;
  });
  // Treat Style DNA coverage as a kitchen-wide allowance. Complete the
  // composition-critical wall (normally the cooktop/rangehood wall) first;
  // only the balance may spill onto sink returns and secondary walls. Giving
  // every wall the full percentage independently created a broken primary run
  // while still spending cabinets on less important return legs.
  let upperAllowance = coverage * upperEligibleRunIndexes.length;
  const coverageByRun = new Map<number, number>();
  for (const runIndex of upperPriority) {
    // Prioritisation must not erase the family's character: Scandinavian and
    // Coastal may lead with the important wall, but neither is allowed to turn
    // that wall into a Hamptons-style full overhead run.
    const allocated = Math.min(
      profile.overheadCoverage.max,
      Math.max(0, upperAllowance),
    );
    coverageByRun.set(runIndex, allocated);
    upperAllowance -= allocated;
  }

  const runs = normalizedRuns.map((run, index) => {
    const runCoverage = coverageByRun.get(index) ?? 0;
    return {
      ...run,
      wallCabinets: runCoverage > 0,
      upperPlan: {
        coverage: runCoverage >= .72 ? 'full' as const : runCoverage >= .4 ? 'selective' as const : runCoverage > 0 ? 'minimal' as const : 'none' as const,
        coverageRatio: runCoverage,
        openShelfRatio: runCoverage > 0 ? shelving : 0,
        featureElements: [...profile.requiredFeatureElements, ...profile.preferredFeatureElements],
      },
    };
  });

  return {
    ...spec,
    runs,
    style: {
      ...spec.style,
      familyId: profile.id,
      familyVersion: profile.version,
      variantId: variant.id,
      doorProfile: profile.doorProfile,
      compositionFeatureIds: [...profile.requiredFeatureElements, ...profile.preferredFeatureElements],
    },
    rationale: `${spec.rationale} ${profile.name} composition uses ${Math.round(coverage * 100)}% overhead coverage and ${Math.round(shelving * 100)}% open shelving.`,
  };
}

export function styleStructuralTraits(profile: StyleDNAProfile): readonly string[] {
  return [
    profile.doorProfile,
    profile.overheadCoverage.target < .35 ? 'few-overheads' : profile.overheadCoverage.target > .7 ? 'full-overheads' : 'selective-overheads',
    profile.openShelvingRatio.target > .4 ? 'open-shelf-led' : profile.openShelvingRatio.target > .1 ? 'mixed-shelving' : 'closed-uppers',
    profile.tallUnitMassing,
    profile.storageCharacter,
    ...profile.requiredFeatureElements.map(element => `required:${element}`),
  ];
}

export function structuralTraitDifference(a: StyleDNAProfile, b: StyleDNAProfile): number {
  const left = new Set(styleStructuralTraits(a));
  const right = new Set(styleStructuralTraits(b));
  return [...left].filter(trait => !right.has(trait)).length + [...right].filter(trait => !left.has(trait)).length;
}
