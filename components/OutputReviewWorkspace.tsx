'use client';

import { useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterRoute, LetterType } from '../lib/letter-engine';
import { packetOrderText } from '../lib/workflow-framework';

export type DocumentRole = 'LETTER' | 'AFFIDAVIT' | 'FTC';

export type ReviewOutput = {
  id?: string;
  path: string;
  type: LetterType;
  role?: DocumentRole;
  sequence?: number;
  bureau: string;
  count: number;
  detail: string;
  blob: Blob;
  packetSteps?: string[];
};

type Props = {
  round: string;
  outputs: ReviewOutput[];
  expected