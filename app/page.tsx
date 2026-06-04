import LetterGeneratorWorkspaceV2 from '../components/LetterGeneratorWorkspaceV2';
import GenerationActivityMonitor from '../components/GenerationActivityMonitor';
import ApplicationRecoveryBoundary from '../components/ApplicationRecoveryBoundary';

export default function Page() {
  return (
    <ApplicationRecoveryBoundary>
      <LetterGeneratorWorkspaceV2 />
      <GenerationActivityMonitor />
    </ApplicationRecoveryBoundary>
  );
}
