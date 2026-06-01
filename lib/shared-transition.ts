'use client';

import { flushSync } from 'react-dom';

type TransitionKind = 'stage' | 'packet' | 'disclosure';
type ViewTransition = { finished: Promise<void> };
type TransitionDocument = Document & { startViewTransition?: (update: () => void) => ViewTransition };

/** Runs a state change through native View Transitions when available, with an immediate accessible fallback. */
export function runSharedTransition(update: () => void, kind: TransitionKind = 'stage') {
  if (typeof document === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  const root = document.documentElement;
  const doc = document as TransitionDocument;
  if (!doc.startViewTransition) {
    update();
    return;
  }
  root.dataset.transitionKind = kind;
  const transition = doc.startViewTransition(() => flushSync(update));
  void transition.finished.finally(() => { delete root.dataset.transitionKind; });
}

export function transitionName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
