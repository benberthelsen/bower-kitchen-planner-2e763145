/**
 * Step 3 — "Design": AI kitchen designer.
 *
 * - "Design my kitchen" → ai-designer edge function → 3 named option cards.
 * - Selecting an option shows the full 3D preview with a chat refine bar
 *   ("move the sink under the window", "more drawers") + Undo.
 * - Always works without AI: a deterministic default design is created on
 *   entry and the AI path degrades to it on any failure.
 */

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerUpLeft, Loader2, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';
import { UnifiedScene } from '@/components/3d/UnifiedScene';
import Scene3DErrorBoundary from '@/components/3d/Scene3DErrorBoundary';
import { DEFAULT_GLOBAL_DIMENSIONS, FINISH_OPTIONS, BENCHTOP_OPTIONS } from '@/constants';
import {
  compileSpec, defaultSpecFor,
} from '@/lib/layout';
import type { DesignBrief, KitchenSpec, ProposedRoomPatch } from '@/lib/layout';
import type { LayoutShape } from '@/lib/layout';
import { useAiDesigner, type AiDesignOption } from '@/hooks/useAiDesigner';
import { evaluateDesign } from '@/lib/designV2';
import { useWizardPricing } from '@/hooks/useWizardPricing';
import type { WizardDesign } from '../wizardBrief';
import { useApplianceCatalog } from '@/hooks/useApplianceCatalog';
import { enrichItemsWithChosenAppliances, synthesiseApplianceOverlays } from '../applianceSelection';
import { featureFlags, isIosDevice } from '@/lib/featureFlags';

interface Props {
  brief: DesignBrief;
  shape: LayoutShape;
  style: { finishId: string; benchtopId: string; handleId: string };
  design: WizardDesign | null;
  chosenAppliances: Record<string, string>;
  onDesignChange: (design: WizardDesign) => void;
  onRoomPatchProposed: (patch: ProposedRoomPatch) => void;
}

interface ChatEntry { role: 'user' | 'assistant'; content: string }

const VIEW_AR_KEY = 'bower.viewArPayload';

const LOADING_LINES = [
  'Measuring your walls…',
  'Placing the sink near your plumbing…',
  'Checking the work triangle…',
  'Trying a few layouts…',
  'Pricing it up…',
];

export default function StepDesign({ brief, shape, style, design, chosenAppliances, onDesignChange, onRoomPatchProposed }: Props) {
  const navigate = useNavigate();
  const { generate, refine, loading, error, lastError, hasActiveSession } = useAiDesigner();
  const [options, setOptions] = useState<AiDesignOption[] | null>(null);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [undoStack, setUndoStack] = useState<WizardDesign[]>([]);
  const [loadingLine, setLoadingLine] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Always have a design: seed the deterministic default on entry.
  useEffect(() => {
    if (!design) {
      const spec = defaultSpecFor(brief, shape, style);
      onDesignChange({ name: 'Standard layout', spec, aiGenerated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rotate loading copy
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLoadingLine(l => (l + 1) % LOADING_LINES.length), 2200);
    return () => clearInterval(t);
  }, [loading]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  const activeSpec: KitchenSpec | null = useMemo(() => {
    if (!design) return null;
    return { ...design.spec, style };
  }, [design, style]);

  const compiled = useMemo(() => (activeSpec ? compileSpec(activeSpec, brief.room) : null), [activeSpec, brief.room]);

  // Homeowner appliance catalog — enrich compiled items with chosen catalog
  // products so the 3D preview here, the AR export below, the Review page
  // and the enquiry payload all show the customer's actual product choices.
  const { products: applianceProducts } = useApplianceCatalog({ activeOnly: true });
  const enrichedItems = useMemo(() => {
    if (!compiled) return [];
    const base = enrichItemsWithChosenAppliances(compiled.items, chosenAppliances, applianceProducts);
    // Sinks, cooktops and ovens live inside cabinets, so the engine never
    // emits them as appliance items and the customer's choice was invisible.
    // Overlays are appended AFTER compileSpec so they stay out of pricing and
    // out of the rules engine — see applianceSelection.ts for why.
    return [...base, ...synthesiseApplianceOverlays(compiled, chosenAppliances, applianceProducts)];
  }, [compiled, chosenAppliances, applianceProducts]);

  const room3D = brief.room;
  const band = useWizardPricing(compiled?.items ?? [], activeSpec?.style ?? style);
  // One rules pipeline (brief v4.3 §4.4): geometric + policy evaluation.
  const evald = useMemo(
    () => (compiled && activeSpec ? evaluateDesign(compiled, brief.room, brief, activeSpec) : null),
    [compiled, brief, activeSpec],
  );
  const violations = useMemo(() => evald?.violations ?? [], [evald]);
  const blockingErrors = useMemo(
    () => violations.filter(v => v.severity === 'error'),
    [violations],
  );
  const warnings = useMemo(() => {
    if (!compiled) return [];
    return Array.from(new Set<string>([
      ...compiled.notes,
      ...violations.filter(v => v.severity === 'warn').map(v => v.message),
    ]));
  }, [compiled, violations]);

  const selectedFinish = FINISH_OPTIONS.find(f => f.id === style.finishId) ?? FINISH_OPTIONS[0];
  const selectedBenchtop = BENCHTOP_OPTIONS.find(b => b.id === style.benchtopId) ?? BENCHTOP_OPTIONS[0];
  const iosDevice = typeof navigator !== 'undefined'
    && isIosDevice(navigator.userAgent, navigator.maxTouchPoints);
  const arEnabled = iosDevice ? featureFlags.iosAr : featureFlags.androidAr;

  const handleGenerate = async () => {
    if (!featureFlags.aiDesigner) return;
    trackEvent('ai_generate_requested', { shape });
    const res = await generate(brief, shape);
    if (!res || res.options.length === 0) {
      trackEvent('ai_generate_failed');
      toast.error('The AI designer is unavailable right now — you can keep going with the standard layout.');
      return;
    }
    trackEvent('ai_generate_succeeded', { count: res.options.length });
    setOptions(res.options);
  };

  const selectOption = (opt: AiDesignOption) => {
    const hardErrors = opt.violations.filter(v => v.severity === 'error');
    if (hardErrors.length > 0) {
      toast.error('This option has a blocking layout problem and cannot be selected.');
      return;
    }
    trackEvent('ai_option_selected', { name: opt.name });
    setUndoStack(design ? [...undoStack.slice(-9), design] : undoStack);
    onDesignChange({ name: opt.name, spec: opt.spec, aiGenerated: true, proposalId: opt.proposalId, priceBand: opt.priceBand });
    setChatLog([{ role: 'assistant', content: `"${opt.name}" — ${opt.rationale}` }]);
  };

  /**
   * Turn a failed refine into something the customer can act on. The old copy
   * ("Sorry — I couldn't apply that just now") was shown for every cause,
   * including causes rewording can never fix, which made the step a dead end.
   */
  const refineFailureMessage = (raw: string | null): string => {
    const code = (raw ?? '').toLowerCase();
    if (code.includes('rate_limited')) {
      return "You've asked for a lot of changes in the last hour, so the designer is taking a breather. It'll free up shortly — or keep this layout and we'll fine-tune it with your quote.";
    }
    if (code.includes('invalid_ai_session') || code.includes('stale_design_revision') || code.includes('stale_brief_revision')) {
      return 'This design session has expired. Tap "Design my kitchen" to start a fresh set of options — your room details are kept.';
    }
    if (code.includes('invalid_parent_proposal')) {
      return "I've lost track of which design we were editing. Tap \"Design my kitchen\" for a fresh set of options.";
    }
    if (code.includes('unsupported_l_shape')) {
      return "I can't edit L-shaped rooms yet — this one needs a human. Keep going and Ben will lay it out with you.";
    }
    if (code.includes('invalid_designer_request')) {
      return 'I\'ve lost the thread on this design. Tap "Design my kitchen" for a fresh set of options and I can edit those.';
    }
    return "Sorry — I couldn't apply that just now. Try rewording it, or keep going and we'll sort it out with your quote.";
  };

  /**
   * True when the designer can actually accept an edit. `proposalId` alone is
   * not enough: it survives a page reload in wizard state, but the authorized
   * session it belongs to does not necessarily, and a refine without a session
   * is rejected by the server before it reaches the model.
   */
  const canRefine = !!design?.aiGenerated && !!design.proposalId && hasActiveSession;

  const runRefine = async (msg: string) => {
    if (!msg || !design || !activeSpec) return;
    if (!design.proposalId || !hasActiveSession) {
      // Don't fire a request that cannot succeed — say something useful.
      setChatLog(log => [...log, { role: 'user', content: msg }, {
        role: 'assistant',
        content: 'I\'ve lost the thread on this design — that happens if the page has been reloaded. Tap "Design my kitchen" for a fresh set of options and I can edit those.',
      }]);
      return;
    }
    // Build the next log ONCE: state and the request share the same value, so
    // the bounded history is never stale relative to what the user sees.
    const nextChatLog: ChatEntry[] = [...chatLog, { role: 'user', content: msg }];
    setChatLog(nextChatLog);
    trackEvent('ai_refine_used');
    const res = await refine(brief, shape, activeSpec, design.proposalId, msg, nextChatLog.slice(-7, -1));
    if (!res || res.options.length === 0) {
      // `lastError()` is a ref, not state, so it is already correct here.
      const why = lastError();
      trackEvent('ai_refine_failed', { reason: why ?? 'unknown' });
      setChatLog(log => [...log, { role: 'assistant', content: refineFailureMessage(why) }]);
      return;
    }
    const updated = res.options[0];
    if (res.proposedRoomPatch) {
      toast.info('Review the suggested change before redesigning your kitchen.');
      onRoomPatchProposed(res.proposedRoomPatch);
      return;
    }
    if (!res.unchanged) {
      // Validate BEFORE applying (brief v4.3 §4.5): never swap in a spec
      // that fails a concept blocker — reject it and keep the current design.
      const updatedSpec: KitchenSpec = { ...updated.spec, style: activeSpec.style };
      const check = evaluateDesign(compileSpec(updatedSpec, brief.room), brief.room, brief, updatedSpec);
      if (check.conceptBlocker) {
        setChatLog(log => [...log, { role: 'assistant', content: "That change would break a layout rule (like aisle width or room bounds), so I haven't applied it. Try a smaller adjustment, or undo and take a different approach." }]);
        return;
      }
      setUndoStack(stack => [...stack.slice(-9), design]);
      onDesignChange({ name: design.name, spec: updated.spec, aiGenerated: true, proposalId: updated.proposalId, priceBand: updated.priceBand ?? design.priceBand });
    }
    setChatLog(log => [...log, { role: 'assistant', content: res.changeSummary || updated.rationale || 'Done.' }]);
  };

  const handleRefine = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput('');
    void runRefine(msg);
  };

  /**
   * Warnings used to be a wall of text with nothing to do about them. Each one
   * now sends itself back to the designer as a plain-English instruction, so
   * the customer has a way forward instead of a list of complaints.
   */
  const handleFixWarning = (warning: string) => {
    if (loading) return;
    trackEvent('ai_fix_warning_used');
    void runRefine(`Please fix this problem with the layout: ${warning}`);
  };

  const handleUndo = () => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setUndoStack(stack => stack.slice(0, -1));
    onDesignChange(prev);
    setChatLog(log => [...log, { role: 'assistant', content: 'Reverted to the previous design.' }]);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Design your kitchen</h2>
        <p className="text-sm text-slate-500">
          Let our AI designer plan it around your room and habits — or keep the standard layout and tweak the style next.
        </p>
      </div>

      {/* AI generate / options */}
      {!options && featureFlags.aiDesigner && (
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {LOADING_LINES[loadingLine]}</>
            : <><Sparkles className="w-4 h-4 mr-2" /> Design my kitchen with AI</>}
        </Button>
      )}

      {!featureFlags.aiDesigner && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">Your standard kitchen concept is ready below.</p>
          <p className="mt-1 text-xs text-slate-500">AI alternatives are temporarily unavailable, but the normal planner and quote journey still work.</p>
        </div>
      )}

      {options && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map(opt => {
            const active = design?.aiGenerated === true && design.proposalId === opt.proposalId;
            const optionErrors = opt.violations.filter(v => v.severity === 'error');
            return (
              <button
                key={opt.proposalId}
                onClick={() => selectOption(opt)}
                disabled={optionErrors.length > 0}
                className={cn(
                  'text-left p-4 rounded-xl border-2 transition-all space-y-1.5',
                  active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400 bg-white',
                  optionErrors.length > 0 && 'border-red-300 bg-red-50 cursor-not-allowed opacity-80',
                )}
              >
                <p className="font-semibold text-sm text-slate-900">{opt.name}</p>
                <p className="text-xs text-slate-500 line-clamp-3">{opt.rationale}</p>
                <p className="text-xs font-medium text-slate-700">
                  ${opt.priceBand.lowAud.toLocaleString()} – ${opt.priceBand.highAud.toLocaleString()}
                </p>
                {opt.violations.filter(v => v.severity === 'warn').length > 0 && (
                  <p className="text-[11px] text-amber-600">
                    {opt.violations.filter(v => v.severity === 'warn').length} thing(s) to know
                  </p>
                )}
                {optionErrors.length > 0 && (
                  <p className="text-[11px] font-medium text-red-700">
                    Unavailable: {optionErrors[0].message}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && !loading && (
        <div className="text-center space-y-0.5">
          <p className="text-xs text-slate-400">AI designer unavailable — showing the standard layout instead.</p>
        </div>
      )}

      {/* 3D preview */}
      {compiled && (
        <div
          className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
          style={{ height: 'clamp(240px, 38vw, 340px)' }}
        >
          <div className="absolute top-2 left-2 z-10 bg-white/85 backdrop-blur rounded-lg px-2.5 py-1">
            <p className="text-xs font-medium text-slate-800">{design?.name}</p>
            {(() => {
              // One canonical band per design: prefer the server proposal band
              // stored on the selection so the option card and this overlay
              // never disagree. Fallback to the local estimator for the
              // default (non-AI) layout.
              const shown = design?.priceBand ?? band;
              return shown && (
                <p className="text-[11px] text-slate-500">
                  ${shown.lowAud.toLocaleString()} – ${shown.highAud.toLocaleString()} AUD
                </p>
              );
            })()}
          </div>
          <Scene3DErrorBoundary>
            <Suspense fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            }>
              <UnifiedScene
                items={enrichedItems}
                room={room3D}
                globalDimensions={DEFAULT_GLOBAL_DIMENSIONS}
                selectedItemId={null}
                draggedItemId={null}
                placementItemId={null}
                onItemSelect={() => {}}
                onItemMove={() => {}}
                is3D={true}
                doorsOpen={false}
                selectedFinish={selectedFinish}
                selectedBenchtop={selectedBenchtop}
              />
            </Suspense>
          </Scene3DErrorBoundary>
        </div>
      )}

      {compiled && arEnabled && (
        <Button
          variant="outline"
          className="w-full h-10 border-slate-300 text-slate-700"
          onClick={async () => {
            // iOS → generate a USDZ and open Apple Quick Look inline.
            // Android/other → existing WebXR flow at /wizard/view-ar.
            const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
            const iOS = isIosDevice(ua, navigator.maxTouchPoints);
            if (iOS) {
              const t = toast.loading('Preparing your kitchen for AR…');
              try {
                const { exportSceneUsdz, openQuickLook } = await import('@/lib/ar/exportSceneUsdz');
                const blob = await exportSceneUsdz(enrichedItems, {
                  onProgress: (m) => toast.loading(m, { id: t }),
                });
                const url = URL.createObjectURL(blob);
                toast.dismiss(t);
                openQuickLook(url);
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              } catch (e) {
                toast.dismiss(t);
                toast.error("Couldn't build the AR file — try again in a moment.");
              }
              return;
            }
            try {
              sessionStorage.setItem(VIEW_AR_KEY, JSON.stringify({
                version: 1,
                items: enrichedItems,
                room: brief.room,
                globalDimensions: DEFAULT_GLOBAL_DIMENSIONS,
                finishId: style.finishId,
                benchtopId: style.benchtopId,
              }));
              navigate('/wizard/view-ar');
            } catch { /* storage blocked - stay put */ }
          }}
        >
          See it in your room (AR)
        </Button>
      )}

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-800">Things worth a look</p>
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <p className="text-xs text-amber-700 flex-1">• {w}</p>
              {canRefine && (
                <button
                  type="button"
                  onClick={() => handleFixWarning(w)}
                  disabled={loading}
                  aria-label={`Ask the designer to fix: ${w}`}
                  className="shrink-0 text-xs font-medium text-amber-900 underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
                >
                  Fix this
                </button>
              )}
            </div>
          ))}
          <p className="text-[11px] text-amber-600 pt-0.5">
            {canRefine
              ? 'These are trade-offs, not mistakes — you can leave them and Ben will talk them through with you.'
              : 'Tap “Design my kitchen” above and the designer can work on these for you.'}
          </p>
        </div>
      )}

      {blockingErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1" role="alert">
          <p className="text-xs font-semibold text-red-800">This layout needs repair before you continue</p>
          {blockingErrors.map(error => (
            <p key={`${error.code}-${error.message}`} className="text-xs text-red-700">{error.message}</p>
          ))}
        </div>
      )}

      {/* chat refine */}
      {(design?.aiGenerated || chatLog.length > 0) && (
        <div className="space-y-2">
          {chatLog.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1.5 px-0.5" aria-live="polite">
              {chatLog.map((m, i) => (
                <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <p className={cn(
                    'text-xs rounded-2xl px-3 py-1.5 max-w-[85%]',
                    m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700',
                  )}>
                    {m.content}
                  </p>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder='Try “move the sink under the window” or “more drawers”'
              value={chatInput}
              disabled={loading}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleRefine(); }}
              className="text-sm"
            />
            <Button size="icon" variant="outline" onClick={handleUndo} disabled={undoStack.length === 0 || loading} title="Undo last change" aria-label="Undo last design change">
              <CornerUpLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" onClick={handleRefine} disabled={loading || !chatInput.trim()} aria-label="Send design request" className="bg-slate-900 hover:bg-slate-800 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
