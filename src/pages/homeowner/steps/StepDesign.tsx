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
  compileSpec, defaultSpecFor, validate,
} from '@/lib/layout';
import type { DesignBrief, KitchenSpec, ProposedRoomPatch } from '@/lib/layout';
import type { LayoutShape } from '@/lib/layout';
import { useAiDesigner, type AiDesignOption } from '@/hooks/useAiDesigner';
import { useWizardPricing } from '@/hooks/useWizardPricing';
import type { WizardDesign } from '../wizardBrief';

interface Props {
  brief: DesignBrief;
  shape: LayoutShape;
  style: { finishId: string; benchtopId: string; handleId: string };
  design: WizardDesign | null;
  onDesignChange: (design: WizardDesign) => void;
  onRoomPatchProposed: (patch: ProposedRoomPatch) => void;
}

interface ChatEntry { role: 'user' | 'assistant'; content: string }

const LOADING_LINES = [
  'Measuring your walls…',
  'Placing the sink near your plumbing…',
  'Checking the work triangle…',
  'Trying a few layouts…',
  'Pricing it up…',
];

export default function StepDesign({ brief, shape, style, design, onDesignChange, onRoomPatchProposed }: Props) {
  const { generate, refine, loading, error } = useAiDesigner();
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

  const room3D = brief.room;
  const band = useWizardPricing(compiled?.items ?? [], activeSpec?.style ?? style);
  const violations = useMemo(
    () => (compiled ? validate(compiled, brief.room, brief) : []),
    [compiled, brief],
  );
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

  const handleGenerate = async () => {
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
    onDesignChange({ name: opt.name, spec: opt.spec, aiGenerated: true, proposalId: opt.proposalId });
    setChatLog([{ role: 'assistant', content: `"${opt.name}" — ${opt.rationale}` }]);
  };

  const handleRefine = async () => {
    const msg = chatInput.trim();
    if (!msg || !design || !activeSpec) return;
    if (!design.proposalId) {
      toast.error('Generate a fresh AI option before asking for design changes.');
      return;
    }
    setChatInput('');
    setChatLog(log => [...log, { role: 'user', content: msg }]);
    trackEvent('ai_refine_used');
    const res = await refine(brief, shape, activeSpec, design.proposalId, msg, chatLog.slice(-6));
    if (!res || res.options.length === 0) {
      setChatLog(log => [...log, { role: 'assistant', content: "Sorry — I couldn't apply that just now. Try rewording, or adjust it after you get your quote." }]);
      return;
    }
    const updated = res.options[0];
    if (res.proposedRoomPatch) {
      toast.info('Review the suggested change before redesigning your kitchen.');
      onRoomPatchProposed(res.proposedRoomPatch);
      return;
    }
    if (!res.unchanged) {
      setUndoStack(stack => [...stack.slice(-9), design]);
      onDesignChange({ name: design.name, spec: updated.spec, aiGenerated: true, proposalId: updated.proposalId });
    }
    setChatLog(log => [...log, { role: 'assistant', content: res.changeSummary || updated.rationale || 'Done.' }]);
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
      {!options && (
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

      {options && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map(opt => {
            const active = design?.name === opt.name && design.aiGenerated;
            const optionErrors = opt.violations.filter(v => v.severity === 'error');
            return (
              <button
                key={opt.name}
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
          <p className="text-[11px] text-slate-300">({error})</p>
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
            {band && (
              <p className="text-[11px] text-slate-500">
                ${band.lowAud.toLocaleString()} – ${band.highAud.toLocaleString()} AUD
              </p>
            )}
          </div>
          <Scene3DErrorBoundary>
            <Suspense fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            }>
              <UnifiedScene
                items={compiled.items}
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

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-0.5">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">• {w}</p>
          ))}
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
      {design?.aiGenerated && (
        <div className="space-y-2">
          {chatLog.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1.5 px-0.5">
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
              onKeyDown={e => { if (e.key === 'Enter') handleRefine(); }}
              className="text-sm"
            />
            <Button size="icon" variant="outline" onClick={handleUndo} disabled={undoStack.length === 0 || loading} title="Undo last change">
              <CornerUpLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" onClick={handleRefine} disabled={loading || !chatInput.trim()} className="bg-slate-900 hover:bg-slate-800 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
