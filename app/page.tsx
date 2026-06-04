import LetterGeneratorWorkspaceV2 from '../components/LetterGeneratorWorkspaceV2';
import ApplicationRecoveryBoundary from '../components/ApplicationRecoveryBoundary';

export default function Page() {
  return (
    <ApplicationRecoveryBoundary>
      <LetterGeneratorWorkspaceV2 />
    </ApplicationRecoveryBoundary>
  );
}
