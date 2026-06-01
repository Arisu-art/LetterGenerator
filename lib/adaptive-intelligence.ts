export type WorkflowStage = 'Dashboard' | 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';

export type ExperienceProfile = {
  transitions: Record<string, number>;
  stageVisits: Record<string, number>;
  actionCounts: Record<string, number>;
  failedClicks: number;
  lastStage: WorkflowStage;
  compactMode: boolean;
  reducedMotion: boolean;
};

export type ExperienceRecommendation = {
  title: string;
  reason: string;
  action: string;
  target: WorkflowStage;
  confidence: number;
};

const STORAGE_KEY = 'lettergenerator.experience.v1';
const FLOW: WorkflowStage[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];

export function initialProfile(): ExperienceProfile {
  return {
    transitions: {},
    stageVisits: {},
    actionCounts: {},
    failedClicks: 0,
    lastStage: 'Dashboard',
    compactMode: false,
    reducedMotion: false
  };
}

export function readProfile(): ExperienceProfile {
  if (typeof window === 'undefined') return initialProfile();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? { ...initialProfile(), ...JSON.parse(saved) } : initialProfile();
  } catch {
    return initialProfile();
  }
}

export function saveProfile(profile: ExperienceProfile) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function learnTransition(profile: ExperienceProfile, previous: WorkflowStage, next: WorkflowStage) {
  const key = `${previous}>${next}`;
  return {
    ...profile,
    lastStage: next,
    transitions: { ...profile.transitions, [key]: (profile.transitions[key] || 0) + 1 },
    stageVisits: { ...profile.stageVisits, [next]: (profile.stageVisits[next] || 0) + 1 }
  };
}

export function registerAction(profile: ExperienceProfile, action: string, failed = false) {
  return {
    ...profile,
    actionCounts: { ...profile.actionCounts, [action]: (profile.actionCounts[action] || 0) + 1 },
    failedClicks: profile.failedClicks + (failed ? 1 : 0)
  };
}

export function nextRecommendation(profile: ExperienceProfile, current: WorkflowStage): ExperienceRecommendation {
  const learned = FLOW.map((target) => ({
    target,
    hits: profile.transitions[`${current}>${target}`] || 0
  })).sort((a, b) => b.hits - a.hits)[0];
  const defaultIndex = FLOW.indexOf(current);
  const defaultTarget = current === 'Dashboard' ? 'Templates' : FLOW[Math.min(defaultIndex + 1, FLOW.length - 1)] || 'Templates';
  const target = learned?.hits > 1 ? learned.target : defaultTarget;
  const confidence = learned?.hits > 1 ? Math.min(96, 58 + learned.hits * 7) : 52;
  const labels: Record<WorkflowStage, string> = {
    Dashboard: 'Review dashboard',
    Templates: 'Configure templates',
    'Source Data': 'Load client source',
    Generate: 'Prepare documents',
    Outputs: 'Review outputs',
    Settings: 'Tune controls'
  };
  return {
    title: labels[target],
    target,
    confidence,
    action: `Continue to ${target}`,
    reason: learned?.hits > 1 ? 'Suggested from your local workflow pattern.' : 'Suggested from the safest completion path.'
  };
}

export function frictionMessage(profile: ExperienceProfile) {
  if (profile.failedClicks >= 3) return 'Repeated blocked actions detected. Complete the required template or source step first.';
  if ((profile.stageVisits['Source Data'] || 0) > 2 && !(profile.actionCounts.generate || 0)) return 'Source review is taking longer than usual. Validate routes before generating.';
  return 'No workflow blockers detected.';
}
