/**
 * Step 2 — "How you cook": household, priorities, appliances, island.
 * Feeds DesignBrief so both the default layout and the AI designer
 * plan around real usage instead of guesses.
 */

import React from 'react';
import { Check } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Priority } from '@/lib/layout';

export interface CookFields {
  householdSize?: number;
  cooks?: 'rare' | 'daily' | 'entertainer';
  priorities: Priority[];
  oven?: '600' | '900';
  cooktop?: 'gas' | 'induction';
  dishwasher: boolean;
  fridgeWidthMm: number;
  fridgeOpeningWidthMm?: number;
  island: 'want' | 'no' | 'if-it-fits';
}

interface Props {
  value: CookFields;
  onChange: (patch: Partial<CookFields>) => void;
}

function Chip({ active, onClick, children, ariaLabel }: { active: boolean; onClick: () => void; children: React.ReactNode; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        'px-3 py-1.5 rounded-full border text-xs sm:text-sm transition-colors flex items-center gap-1.5',
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400',
      )}
    >
      {active && <Check className="w-3 h-3" />}
      {children}
    </button>
  );
}

const PRIORITY_OPTIONS: { id: Priority; label: string }[] = [
  { id: 'storage', label: 'Lots of storage' },
  { id: 'drawers', label: 'Mostly drawers' },
  { id: 'bench-space', label: 'Bench space' },
  { id: 'entertaining', label: 'Entertaining' },
  { id: 'baking', label: 'Baking' },
  { id: 'budget', label: 'Keeping cost down' },
];

export default function StepCook({ value, onChange }: Props) {
  const togglePriority = (p: Priority) =>
    onChange({
      priorities: value.priorities.includes(p)
        ? value.priorities.filter(x => x !== p)
        : [...value.priorities, p],
    });

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1 outline-none">How do you use your kitchen?</h2>
        <p className="text-sm text-slate-500">This shapes where everything goes — skip anything you're unsure about.</p>
      </div>

      <div className="space-y-3">
        <Label>Who's cooking?</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Who's cooking?">
          <Chip active={value.cooks === 'rare'} onClick={() => onChange({ cooks: value.cooks === 'rare' ? undefined : 'rare' })}>Now and then</Chip>
          <Chip active={value.cooks === 'daily'} onClick={() => onChange({ cooks: value.cooks === 'daily' ? undefined : 'daily' })}>Every day</Chip>
          <Chip active={value.cooks === 'entertainer'} onClick={() => onChange({ cooks: value.cooks === 'entertainer' ? undefined : 'entertainer' })}>Love entertaining</Chip>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Household size</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Household size">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <Chip key={n} active={value.householdSize === n} onClick={() => onChange({ householdSize: value.householdSize === n ? undefined : n })}>
              {n === 6 ? '6+' : n}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>What matters most? <span className="text-slate-400 font-normal">(pick any)</span></Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="What matters most?">
          {PRIORITY_OPTIONS.map(p => (
            <Chip key={p.id} active={value.priorities.includes(p.id)} onClick={() => togglePriority(p.id)}>{p.label}</Chip>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Appliances</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Oven</p>
            <div className="flex gap-2" role="group" aria-label="Oven">
              <Chip active={value.oven === '600'} onClick={() => onChange({ oven: value.oven === '600' ? undefined : '600' })}>600mm</Chip>
              <Chip active={value.oven === '900'} onClick={() => onChange({ oven: value.oven === '900' ? undefined : '900' })}>900mm</Chip>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Cooktop</p>
            <div className="flex gap-2" role="group" aria-label="Cooktop">
              <Chip active={value.cooktop === 'gas'} onClick={() => onChange({ cooktop: value.cooktop === 'gas' ? undefined : 'gas' })}>Gas</Chip>
              <Chip active={value.cooktop === 'induction'} onClick={() => onChange({ cooktop: value.cooktop === 'induction' ? undefined : 'induction' })}>Induction</Chip>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Dishwasher</p>
            <div className="flex gap-2" role="group" aria-label="Dishwasher">
              <Chip active={value.dishwasher} onClick={() => onChange({ dishwasher: true })}>Yes</Chip>
              <Chip active={!value.dishwasher} onClick={() => onChange({ dishwasher: false })}>No</Chip>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Fridge body width</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Fridge body width">
              {[600, 700, 800, 900].map(widthMm => (
                <Chip
                  key={widthMm}
                  active={value.fridgeWidthMm === widthMm}
                  onClick={() => onChange({ fridgeWidthMm: widthMm, fridgeOpeningWidthMm: undefined })}
                >
                  {widthMm}mm
                </Chip>
              ))}
            </div>
            <label className="block max-w-[180px] text-xs text-slate-500">
              Other size (mm)
              <input
                type="number"
                min={500}
                max={1400}
                step={1}
                value={value.fridgeWidthMm}
                onChange={event => {
                  const widthMm = Number(event.target.value);
                  if (Number.isFinite(widthMm) && widthMm >= 500 && widthMm <= 1400) {
                    onChange({ fridgeWidthMm: Math.round(widthMm), fridgeOpeningWidthMm: undefined });
                  }
                }}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              />
            </label>
            <p className="text-[11px] leading-4 text-slate-400">
              We add 50mm each side by default. The selected model's installation instructions are checked before manufacture.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Island bench?</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Island bench?">
          <Chip active={value.island === 'want'} onClick={() => onChange({ island: 'want' })}>Yes please</Chip>
          <Chip active={value.island === 'if-it-fits'} onClick={() => onChange({ island: 'if-it-fits' })}>If it fits</Chip>
          <Chip active={value.island === 'no'} onClick={() => onChange({ island: 'no' })}>No island</Chip>
        </div>
      </div>
    </div>
  );
}
