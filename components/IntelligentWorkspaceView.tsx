'use client';

import LetterGeneratorWorkspaceV2 from './LetterGeneratorWorkspaceV2';
import PerformanceBeacon from './PerformanceBeacon';
import PacketMapPreviewController from './PacketMapPreviewController';

export default function IntelligentWorkspaceView() {
  return (
    <>
      <LetterGeneratorWorkspaceV2 />
      <PerformanceBeacon />
      <PacketMapPreviewController />
    </>
  );
}
