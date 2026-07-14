/**
 * Compile-time compatibility proof (master plan §5.4): the contract's local
 * shapes must remain ASSIGNABLE to the planner's app-facing types. This file
 * emits nothing and runs nothing — `npm run roomscan:compat` type-checks it.
 * If a contract change breaks assignability, this file fails to compile.
 */

import type { Opening, RoomConfig, ServicePoint, WallId } from '../../types';
import type {
  OpeningV1,
  RoomSpecV1,
  ServicePointV1,
  WallIdV1,
} from './contract';

// V1 → app-facing. `export` keeps noUnusedLocals happy.
export const wallCompat: WallId = null as unknown as WallIdV1;
export const openingCompat: Opening = null as unknown as OpeningV1;
export const serviceCompat: ServicePoint = null as unknown as ServicePointV1;
export const roomCompat: RoomConfig = null as unknown as RoomSpecV1;

// App-facing feature types must also satisfy V1 (arrays flow both ways
// through RoomFeaturesEditor).
export const openingBack: OpeningV1 = null as unknown as Opening;
export const serviceBack: ServicePointV1 = null as unknown as ServicePoint;
