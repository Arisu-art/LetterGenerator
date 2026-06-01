'use client';

import LetterGeneratorWorkspace from './LetterGeneratorWorkspace';
import PerformanceBeacon from './PerformanceBeacon';
import PacketMapPreviewController from './PacketMapPreviewController';

export default function IntelligentWorkspaceView() {
  return (
    <>
      <LetterGeneratorWorkspace />
      <PerformanceBeacon />
      <PacketMapPreviewController />
    </>
  );
}
