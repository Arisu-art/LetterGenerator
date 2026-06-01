import styles from './intelligence.module.css';
import LetterGeneratorWorkspace from '../../components/LetterGeneratorWorkspace';
import PerformanceBeacon from '../../components/PerformanceBeacon';

export default function IntelligentWorkspacePage() {
  return (
    <div className={styles.experience}>
      <LetterGeneratorWorkspace />
      <PerformanceBeacon />
    </div>
  );
}
