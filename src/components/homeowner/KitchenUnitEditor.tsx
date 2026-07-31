import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  CornerUpLeft,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Scene3DErrorBoundary from '@/components/3d/Scene3DErrorBoundary';
import { UnifiedScene } from '@/components/3d/UnifiedScene';
import { BENCHTOP_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS, FINISH_OPTIONS } from '@/constants';
import { useApplianceCatalog } from '@/hooks/useApplianceCatalog';
import { evaluateDesign } from '@/lib/designV2';
import { compileSpec, type DesignBrief, type KitchenSpec, type SegmentRole } from '@/lib/layout';
import { ROLE_PRODUCTS } from '@/lib/layout/catalogRoles';
import {
  addKitchenUnit,
  cloneKitchenSpec,
  EDITABLE_KITCHEN_ROLES,
  KITCHEN_ROLE_LABELS,
  moveKitchenUnit,
  removeKitchenUnit,
  replaceKitchenUnit,
  segmentWidthMm,
  setRunWallCabinets,
  type KitchenUnitRef,
} from '@/lib/homeowner/kitchenEditor';
import {
  enrichItemsWithChosenAppliances,
  synthesiseApplianceOverlays,
} from '@/pages/homeowner/applianceSelection';
import { cn } from '@/lib/utils';

interface KitchenUnitEditorProps {
  open: boolean;
  designName: string;
  spec: KitchenSpec;
  brief: DesignBrief;
  chosenAppliances: Record<string, string>;
  onOpenChange: (open: boolean) => void;
  onSave: (spec: KitchenSpec, changeCount: number) => void;
}

const WALL_LABELS = {
  N: 'Back wall',
  E: 'Right wall',
  S: 'Front wall',
  W: 'Left wall',
} as const;

function sameRef(a: KitchenUnitRef | null, b: KitchenUnitRef): boolean {
  return !!a && a.runIndex === b.runIndex && a.segmentIndex === b.segmentIndex;
}

export default function KitchenUnitEditor({
  open,
  designName,
  spec,
  brief,
  chosenAppliances,
  onOpenChange,
  onSave,
}: KitchenUnitEditorProps) {
  const [draft, setDraft] = useState(() => cloneKitchenSpec(spec));
  const [history, setHistory] = useState<KitchenSpec[]>([]);
  const [changeCount, setChangeCount] = useState(0);
  const [activeRunIndex, setActiveRunIndex] = useState(0);
  const [selectedRef, setSelectedRef] = useState<KitchenUnitRef | null>(null);
  const [newRole, setNewRole] = useState<SegmentRole>('doors');
  const [newWidth, setNewWidth] = useState(600);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneKitchenSpec(spec));
    setHistory([]);
    setChangeCount(0);
    setActiveRunIndex(0);
    setSelectedRef(null);
  }, [open, spec]);

  useEffect(() => {
    const widths = ROLE_PRODUCTS[newRole].widths;
    if (!widths.includes(newWidth)) setNewWidth(widths[0]);
  }, [newRole, newWidth]);

  const compiled = useMemo(() => compileSpec(draft, brief.room), [draft, brief.room]);
  const evaluation = useMemo(
    () => evaluateDesign(compiled, brief.room, brief, draft),
    [brief, compiled, draft],
  );
  const blockingErrors = evaluation.violations.filter(violation => violation.severity === 'error');
  const { products: applianceProducts } = useApplianceCatalog({ activeOnly: true });
  const sceneItems = useMemo(() => {
    const base = enrichItemsWithChosenAppliances(
      compiled.items,
      chosenAppliances,
      applianceProducts,
    );
    return [
      ...base,
      ...synthesiseApplianceOverlays(compiled, chosenAppliances, applianceProducts),
    ];
  }, [applianceProducts, chosenAppliances, compiled]);

  const activeRun = draft.runs[activeRunIndex] ?? draft.runs[0];
  const addCandidate = useMemo(
    () => activeRun
      ? addKitchenUnit(draft, activeRunIndex, newRole, newWidth)
      : draft,
    [activeRun, activeRunIndex, draft, newRole, newWidth],
  );
  const addCandidateFits = useMemo(() => {
    if (!activeRun || activeRun.segments.length >= 24) return false;
    const candidateRun = addCandidate.runs[activeRunIndex];
    const candidateCompiled = compileSpec(addCandidate, brief.room);
    return candidateRun.segments.every((segment, segmentIndex) =>
      segment.kind !== 'cabinet'
      || candidateCompiled.items.some(item =>
        item.layoutRunIndex === activeRunIndex
        && item.layoutSegmentIndex === segmentIndex));
  }, [activeRun, activeRunIndex, addCandidate, brief.room]);
  const selectedSegment = selectedRef
    ? draft.runs[selectedRef.runIndex]?.segments[selectedRef.segmentIndex]
    : undefined;
  const selectedPlacedItem = selectedRef
    ? compiled.items.find(item =>
      item.layoutRunIndex === selectedRef.runIndex
      && item.layoutSegmentIndex === selectedRef.segmentIndex)
    : undefined;
  const selectedItemId = selectedPlacedItem?.instanceId ?? null;
  const selectedWidth = selectedSegment
    ? selectedPlacedItem?.width ?? segmentWidthMm(selectedSegment)
    : null;

  const applyDraft = (next: KitchenSpec) => {
    if (next === draft) return;
    setHistory(previous => [...previous.slice(-19), draft]);
    setDraft(next);
    setChangeCount(count => count + 1);
  };

  const handleUndo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(stack => stack.slice(0, -1));
    setDraft(previous);
    setChangeCount(count => Math.max(0, count - 1));
    setSelectedRef(null);
  };

  const handleReset = () => {
    setDraft(cloneKitchenSpec(spec));
    setHistory([]);
    setChangeCount(0);
    setSelectedRef(null);
    setActiveRunIndex(0);
  };

  const handleAdd = () => {
    if (!activeRun) return;
    if (!addCandidateFits) {
      toast.error('There is not enough clear space for that unit. Remove or resize a cabinet first.');
      return;
    }
    const gapIndex = activeRun.segments.findIndex(segment =>
      segment.kind === 'gap'
      && segment.widthMm >= newWidth
      && (segment.widthMm === newWidth || segment.widthMm - newWidth >= 10));
    const newIndex = gapIndex >= 0 ? gapIndex : activeRun.segments.length;
    applyDraft(addCandidate);
    setSelectedRef({ runIndex: activeRunIndex, segmentIndex: newIndex });
  };

  const handleSceneSelect = (instanceId: string | null) => {
    if (!instanceId) {
      setSelectedRef(null);
      return;
    }
    const item = compiled.items.find(candidate => candidate.instanceId === instanceId);
    if (item?.layoutRunIndex === undefined || item.layoutSegmentIndex === undefined) return;
    setActiveRunIndex(item.layoutRunIndex);
    setSelectedRef({
      runIndex: item.layoutRunIndex,
      segmentIndex: item.layoutSegmentIndex,
    });
  };

  const selectedFinish = FINISH_OPTIONS.find(option => option.id === draft.style.finishId)
    ?? FINISH_OPTIONS[0];
  const selectedBenchtop = BENCHTOP_OPTIONS.find(option => option.id === draft.style.benchtopId)
    ?? BENCHTOP_OPTIONS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[1180px]">
        <DialogHeader className="border-b border-slate-200 px-4 py-3 pr-12 sm:px-5">
          <DialogTitle>Edit your kitchen</DialogTitle>
          <DialogDescription>
            Select a base or tall cabinet in the 3D view or wall list, then replace, move,
            remove or add units without starting the design again.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.75fr)]">
          <div className="relative h-[36vh] min-h-[260px] overflow-hidden bg-slate-100 lg:h-auto lg:min-h-0">
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-white/70 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
              <p className="max-w-[220px] truncate text-xs font-semibold text-slate-900">{designName}</p>
              <p className="text-[11px] text-slate-500">Cabinet editor · estimate hidden</p>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md bg-slate-900/75 px-2.5 py-1.5 text-[10px] text-white">
              Tap a base or tall unit to edit it
            </div>
            <Scene3DErrorBoundary>
              <Suspense fallback={(
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              )}>
                <UnifiedScene
                  items={sceneItems}
                  room={brief.room}
                  globalDimensions={DEFAULT_GLOBAL_DIMENSIONS}
                  selectedItemId={selectedItemId}
                  draggedItemId={null}
                  placementItemId={null}
                  onItemSelect={handleSceneSelect}
                  onItemMove={() => {}}
                  is3D
                  doorsOpen={false}
                  selectedFinish={selectedFinish}
                  selectedBenchtop={selectedBenchtop}
                />
              </Suspense>
            </Scene3DErrorBoundary>
          </div>

          <div className="min-h-0 overflow-y-auto border-t border-slate-200 bg-white lg:border-l lg:border-t-0">
            <div className="space-y-5 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Cabinet runs</p>
                  <p className="text-xs text-slate-500">Choose the wall you want to change.</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleUndo}
                    disabled={history.length === 0}
                    aria-label="Undo cabinet edit"
                  >
                    <CornerUpLeft className="mr-1 h-3.5 w-3.5" />
                    Undo
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={handleReset}>
                    Reset
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2" role="group" aria-label="Cabinet wall">
                {draft.runs.map((run, runIndex) => (
                  <button
                    key={`${run.wall}-${runIndex}`}
                    type="button"
                    aria-pressed={activeRunIndex === runIndex}
                    onClick={() => {
                      setActiveRunIndex(runIndex);
                      setSelectedRef(null);
                    }}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      activeRunIndex === runIndex
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400',
                    )}
                  >
                    {WALL_LABELS[run.wall]}
                  </button>
                ))}
              </div>

              {activeRun && (
                <>
                  <div className="rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          {WALL_LABELS[activeRun.wall]} units
                        </p>
                        <p className="text-[11px] text-slate-500">Shown from left to right.</p>
                      </div>
                      <button
                        type="button"
                        aria-pressed={activeRun.wallCabinets}
                        onClick={() => applyDraft(setRunWallCabinets(
                          draft,
                          activeRunIndex,
                          !activeRun.wallCabinets,
                        ))}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                          activeRun.wallCabinets
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 text-slate-500',
                        )}
                      >
                        Wall cupboards {activeRun.wallCabinets ? 'on' : 'off'}
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {activeRun.segments.map((segment, segmentIndex) => {
                        const ref = { runIndex: activeRunIndex, segmentIndex };
                        if (segment.kind === 'filler') {
                          return (
                            <div key={segmentIndex} className="px-3 py-2 text-xs text-slate-400">
                              Filler · {segment.widthMm}mm
                            </div>
                          );
                        }
                        if (segment.kind === 'gap') {
                          return (
                            <div key={segmentIndex} className="flex items-center justify-between gap-2 bg-slate-50/70 px-3 py-2.5">
                              <div>
                                <p className="text-xs font-medium text-slate-600">Open space</p>
                                <p className="text-[11px] text-slate-400">{segment.widthMm}mm available</p>
                              </div>
                              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Available</span>
                            </div>
                          );
                        }
                        const placed = compiled.items.find(item =>
                          item.layoutRunIndex === activeRunIndex
                          && item.layoutSegmentIndex === segmentIndex);
                        const width = placed?.width ?? segmentWidthMm(segment);
                        return (
                          <button
                            key={segmentIndex}
                            type="button"
                            aria-label={`Select ${KITCHEN_ROLE_LABELS[segment.role]} ${width}mm`}
                            onClick={() => setSelectedRef(ref)}
                            className={cn(
                              'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                              sameRef(selectedRef, ref)
                                ? 'bg-slate-900 text-white'
                                : 'hover:bg-slate-50',
                            )}
                          >
                            <span className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                              sameRef(selectedRef, ref) ? 'bg-white/10' : 'bg-slate-100',
                            )}>
                              <Box className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold">
                                {KITCHEN_ROLE_LABELS[segment.role]}
                              </span>
                              <span className={cn(
                                'block text-[11px]',
                                sameRef(selectedRef, ref) ? 'text-white/65' : 'text-slate-500',
                              )}>
                                {width}mm
                              </span>
                            </span>
                            <span className={cn(
                              'text-[10px] font-medium uppercase tracking-wide',
                              sameRef(selectedRef, ref) ? 'text-white/65' : 'text-slate-400',
                            )}>
                              Edit
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedRef && selectedSegment?.kind === 'cabinet' && selectedWidth !== null && (
                    <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Replace selected unit</p>
                        <p className="text-xs text-slate-500">Changes update the 3D kitchen immediately.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1 text-[11px] font-medium text-slate-600">
                          Unit type
                          <select
                            aria-label="Replacement unit type"
                            value={selectedSegment.role}
                            onChange={event => {
                              const role = event.target.value as SegmentRole;
                              const width = ROLE_PRODUCTS[role].widths.includes(selectedWidth)
                                ? selectedWidth
                                : ROLE_PRODUCTS[role].widths[0];
                              applyDraft(replaceKitchenUnit(draft, selectedRef, role, width));
                            }}
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                          >
                            {EDITABLE_KITCHEN_ROLES.map(role => (
                              <option key={role} value={role}>{KITCHEN_ROLE_LABELS[role]}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-[11px] font-medium text-slate-600">
                          Width
                          <select
                            aria-label="Replacement unit width"
                            value={selectedWidth}
                            onChange={event => applyDraft(replaceKitchenUnit(
                              draft,
                              selectedRef,
                              selectedSegment.role,
                              Number(event.target.value),
                            ))}
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                          >
                            {ROLE_PRODUCTS[selectedSegment.role].widths.map(width => (
                              <option key={width} value={width}>{width}mm</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={selectedRef.segmentIndex === 0}
                          onClick={() => {
                            applyDraft(moveKitchenUnit(draft, selectedRef, -1));
                            setSelectedRef({ ...selectedRef, segmentIndex: selectedRef.segmentIndex - 1 });
                          }}
                        >
                          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                          Left
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={selectedRef.segmentIndex >= activeRun.segments.length - 1}
                          onClick={() => {
                            applyDraft(moveKitchenUnit(draft, selectedRef, 1));
                            setSelectedRef({ ...selectedRef, segmentIndex: selectedRef.segmentIndex + 1 });
                          }}
                        >
                          Right
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                          onClick={() => {
                            applyDraft(removeKitchenUnit(
                              draft,
                              selectedRef,
                              selectedPlacedItem?.width,
                            ));
                            setSelectedRef(null);
                          }}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Add a unit</p>
                      <p className="text-xs text-slate-500">
                        Uses an open space first, otherwise adds to the end of this wall.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        aria-label="New unit type"
                        value={newRole}
                        onChange={event => setNewRole(event.target.value as SegmentRole)}
                        className="h-10 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                      >
                        {EDITABLE_KITCHEN_ROLES.map(role => (
                          <option key={role} value={role}>{KITCHEN_ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                      <select
                        aria-label="New unit width"
                        value={newWidth}
                        onChange={event => setNewWidth(Number(event.target.value))}
                        className="h-10 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                      >
                        {ROLE_PRODUCTS[newRole].widths.map(width => (
                          <option key={width} value={width}>{width}mm</option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleAdd}
                      disabled={!addCandidateFits}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add to {WALL_LABELS[activeRun.wall].toLowerCase()}
                    </Button>
                    {!addCandidateFits && (
                      <p className="text-[11px] text-amber-700">
                        No clear space for this size. Remove or resize a unit first.
                      </p>
                    )}
                  </div>
                </>
              )}

              {(compiled.notes.length > 0 || blockingErrors.length > 0) && (
                <div className={cn(
                  'rounded-xl border p-3',
                  blockingErrors.length > 0
                    ? 'border-red-200 bg-red-50'
                    : 'border-amber-200 bg-amber-50',
                )}>
                  <p className={cn(
                    'text-xs font-semibold',
                    blockingErrors.length > 0 ? 'text-red-800' : 'text-amber-800',
                  )}>
                    {blockingErrors.length > 0
                      ? 'Fix these before saving'
                      : 'Planner notes'}
                  </p>
                  {[...blockingErrors.map(error => error.message), ...compiled.notes]
                    .slice(0, 4)
                    .map((note, index) => (
                      <p
                        key={`${note}-${index}`}
                        className={cn(
                          'mt-1 text-xs',
                          blockingErrors.length > 0 ? 'text-red-700' : 'text-amber-700',
                        )}
                      >
                        {note}
                      </p>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <p className="hidden text-xs text-slate-500 sm:block">
            {changeCount === 0
              ? 'No cabinet changes yet'
              : `${changeCount} ${changeCount === 1 ? 'change' : 'changes'} ready to save`}
          </p>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-slate-900 text-white hover:bg-slate-800"
              disabled={changeCount === 0 || blockingErrors.length > 0}
              onClick={() => onSave(draft, changeCount)}
            >
              Save kitchen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
