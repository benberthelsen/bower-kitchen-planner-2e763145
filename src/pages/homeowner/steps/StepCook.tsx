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
  island: 'want' | 'no' | 'if-it-fits';
}

interface Props {
  value: CookFields;
  onChange: (patch: Partial<CookFields>) => void;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        <h2 className="text-lg font-semibold text-slate-900 mb-1">How do you use your kitchen?</h2>
        <p className="text-sm text-slate-500">This shapes where everything goes — skip anything you're unsure about.</p>
      </div>

      <div className="space-y-3">
        <Label>Who's cooking?</Label>
        <div className="flex flex-wrap gap-2">
          <Chip active={value.cooks === 'rare'} onClick={() => onChange({ cooks: value.cooks === 'rare' ? undefined : 'rare' })}>Now and then</Chip>
          <Chip active={value.cooks === 'daily'} onClick={() => onChange({ cooks: value.cooks === 'daily' ? undefined : 'daily' })}>Every day</Chip>
          <Chip active={value.cooks === 'entertainer'} onClick={() => onChange({ cooks: value.cooks === 'entertainer' ? undefined : 'entertainer' })}>Love entertaining</Chip>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Household size</Label>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <Chip key={n} active={value.householdSize === n} onClick={() => onChange({ householdSize: value.householdSize === n ? undefined : n })}>
              {n === 6 ? '6+' : n}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>What matters most? <span className="text-slate-400 font-normal">(pick any)</span></Label>
        <div className="flex flex-wrap gap-2">
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
            <div className="flex gap-2">
              <Chip active={value.oven === '600'} onClick={() => onChange({ oven: value.oven === '600' ? undefined : '600' })}>600mm</Chip>
              <Chip active={value.oven === '900'} onClick={() => onChange({ oven: value.oven === '900' ? undefined : '900' })}>900mm</Chip>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Cooktop</p>
            <div className="flex gap-2">
              <Chip active={value.cooktop === 'gas'} onClick={() => onChange({ cooktop: value.cooktop === 'gas' ? undefined : 'gas' })}>Gas</Chip>
              <Chip active={value.cooktop === 'induction'} onClick={() => onChange({ cooktop: value.cooktop === 'induction' ? undefined : 'induction' })}>Induction</Chip>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Dishwasher</p>
            <div className="flex gap-2">
              <Chip active={value.dishwasher} onClick={() => onChange({ dishwasher: true })}>Yes</Chip>
              <Chip active={!value.dishwasher} onClick={() => onChange({ dishwasher: false })}>No</Chip>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Fridge space</p>
            <div className="flex gap-2">
              <Chip active={value.fridgeWidthMm === 860} onClick={() => onChange({ fridgeWidthMm: 860 })}>Standard</Chip>
              <Chip active={value.fridgeWidthMm === 940} onClick={() => onChange({ fridgeWidthMm: 940 })}>Large</Chip>
              <Chip active={value.fridgeWidthMm === 1200} onClick={() => onChange({ fridgeWidthMm: 1200 })}>French door</Chip>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Island bench?</Label>
        <div className="flex flex-wrap gap-2">
          <Chip active={value.island === 'want'} onClick={() => onChange({ island: 'want' })}>Yes please</Chip>
          <Chip active={value.island === 'if-it-fits'} onClick={() => onChange({ island: 'if-it-fits' })}>If it fits</Chip>
          <Chip active={value.island === 'no'} onClick={() => onChange({ island: 'no' })}>No island</Chip>
        </div>
      </div>
    </div>
  );
}
