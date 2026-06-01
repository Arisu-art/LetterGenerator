'use client';

import LetterGeneratorWorkspaceV2 from './LetterGeneratorWorkspaceV2';
import PerformanceBeacon from './PerformanceBeacon';
import AutomaticPacketPreview from './AutomaticPacketPreview';

export default function IntelligentWorkspaceView() {
  return (
    <>
      <LetterGeneratorWorkspaceV2 />
      <PerformanceBeacon />
      <AutomaticPacketPreview />
    </>
  );
}
