/**
 * Versioned submission fingerprint (master plan §6.2/§6.4).
 * RFC 8785/JCS canonical JSON via the `canonicalize` reference
 * implementation — never JavaScript insertion order or ad hoc sorting.
 * The version byte is INSIDE the canonicalized payload so a future
 * algorithm change cannot collide with v1 fingerprints.
 */
import canonicalize from 'npm:canonicalize@2.0.0';
import { sha256Hex } from './security.ts';

export const FINGERPRINT_VERSION = 1 as const;

export async function fingerprintV1(payload: unknown): Promise<string> {
  const canon = canonicalize({ fpVersion: FINGERPRINT_VERSION, payload });
  if (typeof canon !== 'string') throw new Error('payload cannot be canonicalized');
  return await sha256Hex(canon);
}
