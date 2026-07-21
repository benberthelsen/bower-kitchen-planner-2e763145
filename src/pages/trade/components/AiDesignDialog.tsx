/**
 * AiDesignDialog — trade-side "Design with AI" entry (code review §2 + §4.3).
 *
 * The homeowner wizard's StepDesign is coupled to wizard state (lead gate, 3D
 * scene, chat). Rather than drag that coupling into the trade planner, this is
 * a self-contained dialog that reuses the SAME pieces underneath: useAiDesigner
 * (the ai-designer edge function) to generate options, and
 * aiDesignForRoom/proposalToTradeRoom to convert a chosen option back into the
 * existing trade room's cabinets. The pro picks an option and it's applied to
 * the room they already configured — geometry, materials and hardware defaults
 * intact.
 */

import React, { useMemo, useState } from 'react';
import { Loader2, Sparkles, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { LayoutShape, Priority, BudgetBand } from '@/lib/layout';
import { useAiDesigner, type AiDesignOption } from '@/hooks/useAiDesigner';
import type { TradeRoom } from '@/types/trade';
import {
  buildBriefForRoom,
  defaultTradeAiInputs,
  roomSpecFromTradeRoom,
  applyAiOptionToRoom,
  type TradeAiInputs,
} from '@/lib/trade/aiDesignForRoom';

interface Props {
  room: TradeRoom;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Apply the chosen option's cabinets/style to this room. */
  onApply: (patch: Partial<TradeRoom>) => void | Promise<void>;
}

const LAYOUTS: { value: LayoutShape; label: string }[] = [
  { value: 'single-wall', label: 'Single wall' },
  { value: 'galley', label: 'Galley' },
  { value: 'l-shape', label: 'L-shape' },
  { value: 'u-shape', label: 'U-shape' },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'storage', label: 'Storage' },
  { value: 'bench-space', label: 'Bench space' },
  { value: 'entertaining', label: 'Entertaining' },
  { value: 'baking', label: 'Baking' },
  { value: 'budget', label: 'Budget' },
];

const LOADING_LINES = [
  'Measuring the walls…',
  'Placing the sink near the plumbing…',
  'Checking the work triangle…',
  'Trying a few layouts…',
  'Pricing it up…',
];

export default function AiDesignDialog({ room, open, onOpenChange, onApply }: Props) {
  const { generate, loading, error } = useAiDesigner();
  const [inputs, setInputs] = useState<TradeAiInputs>(() => defaultTradeAiInputs(room));
  const [options, setOptions] = useState<AiDesignOption[] | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [loadingLine, setLoadingLine] = useState(0);

  // Rotate the loading copy while the edge function works.
  React.useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLoadingLine((l) => (l + 1) % LOADING_LINES.length), 2200);
    return () => clearInterval(t);
  }, [loading]);

  // The room spec used for BOTH generation and applying, so the option's
  // server-compiled items map back onto the same geometry.
  const roomSpec = useMemo(() => roomSpecFromTradeRoom(room), [room]);

  const set = <K extends keyof TradeAiInputs>(key: K, value: TradeAiInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const togglePriority = (p: Priority) =>
    setInputs((prev) => ({
      ...prev,
      priorities: prev.priorities.includes(p)
        ? prev.priorities.filter((x) => x !== p)
        : [...prev.priorities, p],
    }));

  const handleGenerate = async () => {
    setOptions(null);
    const brief = buildBriefForRoom(room, inputs);
    const res = await generate(brief, inputs.shape);
    if (!res || res.options.length === 0) {
      toast.error('The AI designer is unavailable right now — try again, or place cabinets manually.');
      return;
    }
    setOptions(res.options);
  };

  const handlePick = async (opt: AiDesignOption) => {
    const hardErrors = opt.violations.filter((v) => v.severity === 'error');
    if (hardErrors.length > 0) {
      toast.error('This option has a blocking layout problem and cannot be applied.');
      return;
    }
    setApplyingId(opt.proposalId);
    try {
      const patch = applyAiOptionToRoom(room, opt, roomSpec);
      await onApply(patch);
      toast.success(`"${opt.name}" applied — ${patch.cabinets?.length ?? 0} products placed. Open the planner to fine-tune.`);
      onOpenChange(false);
    } catch (e) {
      console.error('[trade-ai] apply failed:', e);
      toast.error('Could not apply this design. Please try again.');
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-trade-amber" />
            Design "{room.name}" with AI
          </DialogTitle>
          <DialogDescription>
            The AI designs around this room's measurements, openings and services. Pick an option to
            place its cabinets into the room — you can edit everything afterward in the planner.
          </DialogDescription>
        </DialogHeader>

        {/* Brief inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Layout</Label>
            <Select value={inputs.shape} onValueChange={(v) => set('shape', v as LayoutShape)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LAYOUTS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Island</Label>
            <Select value={inputs.island} onValueChange={(v) => set('island', v as TradeAiInputs['island'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="if-it-fits">If it fits</SelectItem>
                <SelectItem value="want">Include an island</SelectItem>
                <SelectItem value="no">No island</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Cooktop</Label>
            <Select value={inputs.cooktop} onValueChange={(v) => set('cooktop', v as TradeAiInputs['cooktop'])}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="induction">Induction</SelectItem>
                <SelectItem value="gas">Gas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Oven</Label>
            <Select
              value={inputs.oven ?? 'none'}
              onValueChange={(v) => set('oven', v === 'none' ? undefined : (v as '600' | '900'))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="600">600mm</SelectItem>
                <SelectItem value="900">900mm</SelectItem>
                <SelectItem value="none">No oven tower</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Budget band</Label>
            <Select value={inputs.budgetBand} onValueChange={(v) => set('budgetBand', v as BudgetBand)}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Value</SelectItem>
                <SelectItem value="mid">Mid</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-trade-border px-3 py-2">
            <Label htmlFor="dw-toggle" className="cursor-pointer">Dishwasher</Label>
            <Switch id="dw-toggle" checked={inputs.dishwasher} onCheckedChange={(v) => set('dishwasher', v)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Priorities</Label>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => {
                const active = inputs.priorities.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => togglePriority(p.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                      active
                        ? 'bg-trade-navy text-white border-trade-navy'
                        : 'bg-trade-surface text-trade-muted border-trade-border hover:border-trade-navy',
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="style-words">Style direction (optional)</Label>
            <Textarea
              id="style-words"
              placeholder='e.g. "warm coastal, oak + matte white, shaker doors, black tapware"'
              value={inputs.styleWords ?? ''}
              onChange={(e) => set('styleWords', e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {/* Generate */}
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full h-11 bg-trade-navy hover:bg-trade-navy-light text-white"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {LOADING_LINES[loadingLine]}</>
            : <><Sparkles className="w-4 h-4 mr-2" /> {options ? 'Regenerate options' : 'Generate designs'}</>}
        </Button>

        {error && !loading && (
          <p className="text-xs text-center text-trade-muted">AI designer unavailable ({error}).</p>
        )}

        {/* Options */}
        {options && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {options.map((opt) => {
              const optionErrors = opt.violations.filter((v) => v.severity === 'error');
              const optionWarns = opt.violations.filter((v) => v.severity === 'warn');
              const isApplying = applyingId === opt.proposalId;
              const disabled = optionErrors.length > 0 || applyingId !== null;
              return (
                <div
                  key={opt.proposalId}
                  className={cn(
                    'text-left p-4 rounded-xl border-2 space-y-1.5 flex flex-col',
                    optionErrors.length > 0 ? 'border-red-300 bg-red-50' : 'border-trade-border bg-trade-surface',
                  )}
                >
                  <p className="font-semibold text-sm text-trade-navy">{opt.name}</p>
                  <p className="text-xs text-trade-muted line-clamp-3 flex-1">{opt.rationale}</p>
                  <p className="text-xs font-medium text-trade-navy">
                    ${opt.priceBand.lowAud.toLocaleString()} – ${opt.priceBand.highAud.toLocaleString()}
                  </p>
                  {optionWarns.length > 0 && (
                    <p className="text-[11px] text-amber-600">{optionWarns.length} thing(s) to know</p>
                  )}
                  {optionErrors.length > 0 ? (
                    <p className="text-[11px] font-medium text-red-700">Unavailable: {optionErrors[0].message}</p>
                  ) : (
                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() => handlePick(opt)}
                      className="mt-1 bg-trade-amber hover:bg-trade-amber/90 text-trade-navy"
                    >
                      {isApplying
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Applying…</>
                        : <><Check className="w-3.5 h-3.5 mr-1.5" /> Use this design</>}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applyingId !== null}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
