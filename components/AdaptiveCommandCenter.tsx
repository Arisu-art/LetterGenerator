'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  frictionMessage,
  initialProfile,
  learnTransition,
  nextRecommendation,
  readProfile,
  registerAction,
  saveProfile,
  type ExperienceProfile,
  type WorkflowStage
} from '../lib/adaptive-intelligence';

const NAV_STAGES: WorkflowStage[] = ['Dashboard', 'Templates', 'Source Data', 'Generate', 'Outputs', 'Settings'];
const QUICK_TASKS: Array<{ title: string; stage: WorkflowStage; description: string }> = [
  { title: 'Configure template', stage: 'Templates', description: 'Map DOCX references and static packet files.' },
  { title: 'Load source TXT', stage: 'Source Data', description: 'Paste or upload structured client source.' },
  { title: 'Generate letters', stage: 'Generate', description: 'Build bureau-specific review documents.' },
  { title: 'Review outputs', stage: 'Outputs', description: 'Inspect and finalize prepared packets.' }
];

function readStageFromButton(target: EventTarget | null) {
  const button = target instanceof Element ? target.closest('button') : null;
  const text = button?.textContent?.replace(/\s+/g, ' ').trim() || '';
  return NAV_STAGES.find((stage) => text.includes(stage)) || null;
}

function goToStage(stage: WorkflowStage) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar nav button'));
  const button = buttons.find((item) => item.textContent?.includes(stage));
  button?.click();
}

function applyExperience(profile: ExperienceProfile) {
  const root = document.documentElement;
  root.classList.toggle('adaptive-compact', profile.compactMode);
  root.classList.toggle('adaptive-reduced-motion', profile.reducedMotion);
}

export default function AdaptiveCommandCenter() {
  const [profile, setProfile] = useState<ExperienceProfile>(initialProfile());
  const [open, setOpen] = useState(true);
  const [currentStage, setCurrentStage] = useState<WorkflowStage>('Dashboard');
  const [focusMode, setFocusMode] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    const stored = readProfile();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const narrow = window.innerWidth < 900;
    const next = { ...stored, reducedMotion: stored.reducedMotion || reduce, compactMode: stored.compactMode || narrow };
    setProfile(next);
    applyExperience(next);
    saveProfile(next);

    const listen = (event: MouseEvent) => {
      const stage = readStageFromButton(event.target);
      if (!stage) return;
      setCurrentStage((prior) => {
        setProfile((value) => {
          const learned = learnTransition(value, prior, stage);
          saveProfile(learned);
          return learned;
        });
        return stage;
      });
    };
    document.addEventListener('click', listen);
    return () => document.removeEventListener('click', listen);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('adaptive-focus', focusMode);
  }, [focusMode]);

  const recommendation = useMemo(() => nextRecommendation(profile, currentStage), [profile, currentStage]);
  const friction = useMemo(() => frictionMessage(profile), [profile]);
  const suggestedTasks = useMemo(() => {
    const first = QUICK_TASKS.find((task) => task.stage === recommendation.target);
    return first ? [first, ...QUICK_TASKS.filter((task) => task.stage !== first.stage)] : QUICK_TASKS;
  }, [recommendation.target]);

  function performRecommendation() {
    const failed = recommendation.target === 'Outputs' && !(profile.actionCounts.generate || 0);
    const next = registerAction(profile, 'recommendation', failed);
    setProfile(next);
    saveProfile(next);
    goToStage(recommendation.target);
  }

  function toggleSetting(key: 'compactMode' | 'reducedMotion') {
    const next = { ...profile, [key]: !profile[key] };
    setProfile(next);
    applyExperience(next);
    saveProfile(next);
  }

  function resetLearning() {
    const next = initialProfile();
    setProfile(next);
    applyExperience(next);
    saveProfile(next);
    setCurrentStage('Dashboard');
  }

  if (!open) {
    return <button className="adaptive-launch" onClick={() => setOpen(true)} aria-label="Open adaptive assistant">AI</button>;
  }

  return (
    <aside className="adaptive-center" aria-label="Adaptive workflow assistant">
      <header className="adaptive-head">
        <div>
          <small>ADAPTIVE WORKFLOW</small>
          <strong>Command Center</strong>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close assistant">×</button>
      </header>

      <section className="adaptive-prediction">
        <span className="adaptive-live">Predictive next step</span>
        <h3>{recommendation.title}</h3>
        <p>{recommendation.reason}</p>
        <div className="confidence"><span style={{ width: `${recommendation.confidence}%` }} /><small>{recommendation.confidence}% relevance</small></div>
        <button className="adaptive-primary" onClick={performRecommendation}>{recommendation.action}</button>
      </section>

      <section className="adaptive-friction">
        <strong>Attention manager</strong>
        <p>{friction}</p>
        <button className={focusMode ? 'enabled' : ''} onClick={() => setFocusMode(!focusMode)}>{focusMode ? 'Focus mode active' : 'Enable focus mode'}</button>
      </section>

      <section className="adaptive-queue">
        <strong>Smart task order</strong>
        {suggestedTasks.slice(0, 3).map((task, index) => (
          <button key={task.stage} onClick={() => goToStage(task.stage)}>
            <i>0{index + 1}</i><span><b>{task.title}</b><small>{task.description}</small></span>
          </button>
        ))}
      </section>

      <section className="adaptive-controls">
        <strong>Resource optimization</strong>
        <label><input type="checkbox" checked={profile.compactMode} onChange={() => toggleSetting('compactMode')} /> Compact workspace</label>
        <label><input type="checkbox" checked={profile.reducedMotion} onChange={() => toggleSetting('reducedMotion')} /> Reduced motion</label>
      </section>

      <footer className="adaptive-footer">
        <button onClick={() => setShowPrivacy(!showPrivacy)}>Privacy & learning</button>
        <button onClick={resetLearning}>Reset</button>
        {showPrivacy && <p>Adaptation is stored locally in this browser. No emotion inference, camera analysis, or invisible cross-user testing is performed.</p>}
      </footer>
    </aside>
  );
}
