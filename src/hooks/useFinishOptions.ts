import { FINISH_OPTIONS, BENCHTOP_OPTIONS, HANDLE_OPTIONS, KICK_OPTIONS } from '@/constants';
import { MaterialOption, HandleDefinition } from '@/types';
import { UserType } from './useCatalog';

// Curated finish options for standard users - most popular choices
const STANDARD_FINISH_IDS = [
  'do-designer-white',
  'do-classic-white',
  'do-charcoal',
  'do-natural-oak',
];

const STANDARD_BENCHTOP_IDS = [
  'egger-premium-white',
  'egger-white-carrara',
  'egger-concrete-chicago-light',
];

const STANDARD_HANDLE_IDS = [
  'handle-bar-ss',
  'handle-bar-bk',
  'handle-none',
];

const STANDARD_KICK_IDS = [
  'kick-stainless',
  'kick-black',
  'kick-white',
];

export function useFinishOptions(userType: UserType = 'standard') {
  const isFullAccess = userType === 'trade' || userType === 'admin';
  
  const finishOptions: MaterialOption[] = isFullAccess 
    ? FINISH_OPTIONS 
    : FINISH_OPTIONS.filter(opt => STANDARD_FINISH_IDS.includes(opt.id));
  
  const benchtopOptions: MaterialOption[] = isFullAccess 
    ? BENCHTOP_OPTIONS 
    : BENCHTOP_OPTIONS.filter(opt => STANDARD_BENCHTOP_IDS.includes(opt.id));
  
  const handleOptions: HandleDefinition[] = isFullAccess 
    ? HANDLE_OPTIONS 
    : HANDLE_OPTIONS.filter(opt => STANDARD_HANDLE_IDS.includes(opt.id));
  
  const kickOptions: MaterialOption[] = isFullAccess 
    ? KICK_OPTIONS 
    : KICK_OPTIONS.filter(opt => STANDARD_KICK_IDS.includes(opt.id));
  
  return {
    finishOptions,
    benchtopOptions,
    handleOptions,
    kickOptions,
    isFullAccess,
  };
}
