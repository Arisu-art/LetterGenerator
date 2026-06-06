'use client';

import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { renderAsync } from 'docx-preview';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import SimpleDocxEditor from './SimpleDocxEditor';
import type { PacketAssets } from '../lib/packet-assets';
import type { LetterRoute, LetterType } from '../lib/letter-engine';
import { packetOrderText } from '../lib/workflow-framework';

export type DocumentRole = 'LETTER' | 'AFFIDAVIT' | 'FTC';

export