'use client';

import { useMemo, useState } from 'react';
import SimpleDocxEditor from './SimpleDocxEditor';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterType } from '../lib/letter-engine';

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