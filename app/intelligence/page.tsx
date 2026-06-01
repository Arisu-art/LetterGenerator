import styles from './intelligence.module.css';
import LetterGeneratorWorkspace from '../../components/LetterGeneratorWorkspace';
import AdaptiveCommandCenter from '../../components/AdaptiveCommandCenter';

export default function IntelligentWorkspacePage() {
  return (
    <div className={styles.experience}>
      <LetterGeneratorWorkspace />
      <AdaptiveCommandCenter />
    </div>
  );
}
