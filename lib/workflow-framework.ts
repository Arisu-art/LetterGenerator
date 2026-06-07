import { isFeatureEnabled, shouldProcessFeature } from './feature-flags';
import type { LetterType } from './letter-engine';
import type { ExhibitKind } from './template-exhibits';

/**
 * Available packet positions. FTC is included if the feature flag is enabled.
 */
export type ActivePacketPosition = 'LETTER' | 'SUPPORTING' | 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';

export type PacketPosition = {
  id: ActivePacketPosition;
  number: number;
  label: string