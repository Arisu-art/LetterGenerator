import styles from './intelligence.module.css';
import LetterGeneratorWorkspace from '../../components/LetterGeneratorWorkspace';
import AdaptiveCommandCenter from '../../components/AdaptiveCommandCenter';
import PerformanceBeacon from '../../components/PerformanceBeacon';

export default function IntelligentWorkspacePage() {
  return (
    <div className={styles.experience}>
      <LetterGeneratorWorkspace />
      <AdaptiveCommandCenter />
      <PerformanceBeacon />
    </div>
  );
}
