/**
 * Style presets — curated finish/benchtop/handle combinations for the wizard
 * Style step and the AI `style` mode. Uses ONLY existing option ids from
 * src/constants.ts. Later (P8) these move to the style_presets table; keep
 * this file as the seed + offline fallback.
 */

import type { StyleSpec } from '@/lib/layout';

export interface StylePreset {
  id: string;
  name: string;
  blurb: string;
  style: StyleSpec;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'classic-white',
    name: 'Classic White',
    blurb: 'Crisp, bright, timeless — the safe crowd-pleaser.',
    style: { finishId: 'do-classic-white', benchtopId: 'egger-premium-white', handleId: 'handle-bar-ss' },
  },
  {
    id: 'coastal',
    name: 'Coastal',
    blurb: 'White doors with soft marble — light and airy.',
    style: { finishId: 'do-designer-white', benchtopId: 'egger-white-carrara', handleId: 'handle-bar-ss' },
  },
  {
    id: 'scandi',
    name: 'Scandi',
    blurb: 'Pale oak, clean lines, handle-free fronts.',
    style: { finishId: 'do-natural-oak', benchtopId: 'egger-premium-white', handleId: 'handle-none' },
  },
  {
    id: 'japandi',
    name: 'Japandi',
    blurb: 'Warm oak on oak — calm and minimal.',
    style: { finishId: 'do-natural-oak', benchtopId: 'egger-halifax-oak-nat', handleId: 'handle-lip-ss' },
  },
  {
    id: 'hamptons',
    name: 'Hamptons',
    blurb: 'Classic white with marble and knob detailing.',
    style: { finishId: 'do-classic-white', benchtopId: 'egger-white-carrara', handleId: 'handle-knob-ss' },
  },
  {
    id: 'modern-dark',
    name: 'Modern Dark',
    blurb: 'Charcoal on black — bold and dramatic.',
    style: { finishId: 'do-charcoal', benchtopId: 'egger-black', handleId: 'handle-bar-bk' },
  },
  {
    id: 'industrial',
    name: 'Industrial',
    blurb: 'Stone grey with dark concrete benchtops.',
    style: { finishId: 'do-stone-grey', benchtopId: 'egger-concrete-chicago-dark', handleId: 'handle-bar-bk' },
  },
  {
    id: 'warm-timber',
    name: 'Warm Timber',
    blurb: 'Spotted gum and oak with brushed gold.',
    style: { finishId: 'do-spotted-gum', benchtopId: 'egger-halifax-oak-nat', handleId: 'handle-bar-go' },
  },
];
