'use client';

import LetterGeneratorWorkspaceV2 from './LetterGeneratorWorkspaceV2';
import PerformanceBeacon from './PerformanceBeacon';
import ContinuousPacketUpgrade from './ContinuousPacketUpgrade';

/**
 * The intelligence surface remains lightweight until a user intentionally enters
 * a document preview. Heavy packet rendering is no longer triggered on modal open.
 */
export default function IntelligentWorkspaceView() {
  return (
    <>
      <LetterGeneratorWorkspaceV2 />
      <PerformanceBeacon />
      <ContinuousPacketUpgrade />
    </>
  );
}
