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

export const featureFlags = Object.freeze({
  aiDesigner: enabled(import.meta.env.VITE_FEATURE_AI_DESIGNER),
  roomScanner: enabled(import.meta.env.VITE_FEATURE_ROOM_SCANNER),
  androidAr: enabled(import.meta.env.VITE_FEATURE_ANDROID_AR),
  iosAr: enabled(import.meta.env.VITE_FEATURE_IOS_AR),
});

export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Mac/.test(userAgent) && maxTouchPoints > 1);
}
