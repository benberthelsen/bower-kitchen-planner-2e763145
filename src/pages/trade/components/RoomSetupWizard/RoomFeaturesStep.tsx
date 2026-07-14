/**
 * Room Features step — doors, windows, walkways and service points, placed on
 * the same shared editor the homeowner wizard uses (master plan §8.2). Sits
 * immediately after Room Shape because that step owns the floor dimensions.
 * Features are stored on the room config and drive the trade planner's
 * opening rendering and warn-only placement guards.
 */
import React from 'react';
import { RoomFeaturesEditor } from '@/components/shared/RoomFeaturesEditor';
import type { RoomConfig } from './index';

interface Props {
  config: RoomConfig;
  updateConfig: (updates: Partial<RoomConfig>) => void;
}

export default function RoomFeaturesStep({ config, updateConfig }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-trade-muted">
        Mark doors, windows, open walkways and services (plumbing, power, gas,
        ducting). The planner avoids openings when placing cabinetry and warns
        about conflicts — a check measure still confirms everything before
        manufacture.
      </p>
      <RoomFeaturesEditor
        widthMm={config.roomWidth}
        depthMm={config.roomDepth}
        openings={config.openings}
        services={config.services}
        onChange={(patch) => updateConfig(patch)}
      />
      {config.shape !== 'rectangular' && (
        <p className="text-xs text-trade-muted">
          Features are placed on the room's outer rectangle; wings and cutouts
          are handled in the planner.
        </p>
      )}
    </div>
  );
}
