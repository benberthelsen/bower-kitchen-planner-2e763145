export type ManualWall = 'N' | 'E' | 'S' | 'W';
export type ManualOpeningType = 'door' | 'window';

export interface ManualRoomDimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

export interface ManualOpeningDraft {
  id: string;
  type: ManualOpeningType;
  wall: ManualWall | '';
  offsetMm: string;
  widthMm: string;
}

export interface ManualOpeningInput {
  id: string;
  type: ManualOpeningType;
  wall: ManualWall;
  offsetMm: number;
  widthMm: number;
}

export const MANUAL_WALL_OPTIONS: ReadonlyArray<{
  value: ManualWall;
  label: string;
  dimension: 'width' | 'depth';
}> = [
  { value: 'N', label: 'Main wall', dimension: 'width' },
  { value: 'E', label: 'Right wall', dimension: 'depth' },
  { value: 'S', label: 'Opposite wall', dimension: 'width' },
  { value: 'W', label: 'Left wall', dimension: 'depth' },
];

export const manualWallLabel = (wall: ManualWall): string =>
  MANUAL_WALL_OPTIONS.find((option) => option.value === wall)?.label ?? 'wall';

const openingName = (
  opening: Pick<ManualOpeningDraft, 'type'>,
  index: number,
  drafts: ReadonlyArray<Pick<ManualOpeningDraft, 'type'>>,
): string => {
  const sameType = drafts.filter((candidate) => candidate.type === opening.type);
  const number = drafts.slice(0, index + 1).filter((candidate) => candidate.type === opening.type).length;
  const label = opening.type === 'door' ? 'Door' : 'Window';
  return sameType.length > 1 ? `${label} ${number}` : label;
};

const wallLengthMm = (wall: ManualWall, dimensions: ManualRoomDimensions): number =>
  wall === 'N' || wall === 'S' ? dimensions.widthMm : dimensions.depthMm;

export function validateManualOpeningDrafts(
  drafts: ReadonlyArray<ManualOpeningDraft>,
  dimensions: ManualRoomDimensions,
): { openings: ManualOpeningInput[]; error: null } | { openings: []; error: string } {
  const openings: ManualOpeningInput[] = [];

  for (const [index, draft] of drafts.entries()) {
    const label = openingName(draft, index, drafts);
    if (!draft.wall) {
      return { openings: [], error: `Choose which wall ${label.toLowerCase()} is on.` };
    }

    const offsetMm = Math.round(Number(draft.offsetMm));
    const widthMm = Math.round(Number(draft.widthMm));
    if (
      !Number.isFinite(offsetMm)
      || !Number.isFinite(widthMm)
      || offsetMm < 0
      || widthMm < 300
      || widthMm > 3000
    ) {
      return {
        openings: [],
        error: `${label}: distance from the left corner must be 0 or more, and width must be 300–3000 mm.`,
      };
    }

    const lengthMm = wallLengthMm(draft.wall, dimensions);
    if (offsetMm + widthMm > lengthMm) {
      return {
        openings: [],
        error: `${label} extends past the ${manualWallLabel(draft.wall).toLowerCase()}. Distance from the left corner plus width must fit within ${lengthMm} mm.`,
      };
    }

    const overlap = openings.find((opening) =>
      opening.wall === draft.wall
      && offsetMm < opening.offsetMm + opening.widthMm
      && opening.offsetMm < offsetMm + widthMm);
    if (overlap) {
      const overlapIndex = drafts.findIndex((candidate) => candidate.id === overlap.id);
      const overlapLabel = openingName(drafts[overlapIndex], overlapIndex, drafts);
      return {
        openings: [],
        error: `${label} overlaps ${overlapLabel.toLowerCase()} on the ${manualWallLabel(draft.wall).toLowerCase()}. Adjust either distance or width.`,
      };
    }

    openings.push({
      id: draft.id,
      type: draft.type,
      wall: draft.wall,
      offsetMm,
      widthMm,
    });
  }

  return { openings, error: null };
}
