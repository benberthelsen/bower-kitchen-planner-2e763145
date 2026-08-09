/**
 * Public build-time feature controls.
 *
 * All features default to enabled so existing deployments keep their current
 * behaviour. Set a value to "false", "0", "off", or "disabled" in the
 * deployment environment to remove only that optional path.
 */

function enabled(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return true;
  return !['false', '0', 'off', 'disabled'].includes(value.trim().toLowerCase());
}

function optIn(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false;
  return ['true', '1', 'on', 'enabled'].includes(value.trim().toLowerCase());
}

export const featureFlags = Object.freeze({
  /** Unified v5 Style + Design experience. Set false for the retained split-step rollback. */
  // Kept off in the live build until Bower signs the per-family reference
  // reviews. The design-studio Vite mode enables the clickable preview.
  designStudio: optIn(import.meta.env.VITE_FEATURE_DESIGN_STUDIO),
  /** Local preview-only AI ranker. Provider keys remain in the Vite server. */
  localAiDesigner: optIn(import.meta.env.VITE_LOCAL_AI_DESIGNER),
  aiDesigner: enabled(import.meta.env.VITE_FEATURE_AI_DESIGNER),
  roomScanner: enabled(import.meta.env.VITE_FEATURE_ROOM_SCANNER),
  androidAr: enabled(import.meta.env.VITE_FEATURE_ANDROID_AR),
  iosAr: enabled(import.meta.env.VITE_FEATURE_IOS_AR),
});

export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Mac/.test(userAgent) && maxTouchPoints > 1);
}
