import { bureaus, detectRoutes, parseSource } from './letter-engine';
import { loadPacketAssets, loadPacketFile, replacePacketAssetsFromSnapshot, type PacketAssets } from './packet-assets';
import { defaultReferences, loadReferenceMeta, readReferenceFile, rounds, saveReferenceFile, type LetterReference, type Round } from './reference-store';
import { exhibitKinds, loadTemplateExhibits, readTemplateExhibit, saveTemplateExhibit, type ExhibitAsset, type ExhibitKind, type TemplateExhibits } from './template-exhibits';
import type { WorkspacePreferences } from './workspace-preferences';

export const WORKSPACE_SNAPSHOT_VERSION = 1;
export const WORKSPACE_ENGINE = 'LETTERGENERATOR_WORKSPACE_SNAPSHOT';

type EncodedFile = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  base64: string;
};

type SnapshotReference = LetterReference & { filePayload: EncodedFile | null };
type SnapshotExhibit = ExhibitAsset & { filePayload: EncodedFile | null };

type SnapshotRoundExhibits = Record<ExhibitKind, SnapshotExhibit | null>;

export type WorkspaceSnapshot = {
  engine: typeof WORKSPACE_ENGINE;
  version: typeof WORKSPACE_SNAPSHOT_VERSION;
  exportedAt: string;
  fingerprint: {
    userAgent: string;
    appOrigin: string;
    sourceHash: string;
    routeCount: number;
    disputeAccountCount: number;
    hardInquiryCount: number;
    latePaymentCount: number;
  };
  round: Round;
  caseId: string;
  source: {
    text: string;
    originalSource: string;
    normalized: boolean;
  };
  preferences: WorkspacePreferences;
  references: SnapshotReference[];
  exhibitsByRound: Record<Round, SnapshotRoundExhibits>;
  packetAssets: PacketAssets;
  packetFiles: Record<string, EncodedFile>;
};

export type WorkspaceSnapshotImportResult = {
  round: Round;
  caseId: string;
  source: string;
  originalSource: string;
  normalized: boolean;
  references: LetterReference[];
  templates: TemplateExhibits;
  evidence: PacketAssets;
  notices: string[];
};

function assertBrowser() {
  if (typeof window === 'undefined') throw new Error('Workspace snapshots can only run in the browser.');
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function emptyRoundExhibits(): SnapshotRoundExhibits {
  return { FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null };
}

function dataUrlToBase64(value: string) {
  const index = value.indexOf(',');
  return index >= 0 ? value.slice(index + 1) : value;
}

async function encodeFile(file: File | Blob | null, fallbackName = 'workspace-file'): Promise<EncodedFile | null> {
  if (!file) return null;
  const name = file instanceof File ? file.name : fallbackName;
  const type = file.type || 'application/octet-stream';
  const size = file.size;
  const lastModified = file instanceof File ? file.lastModified : Date.now();

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read workspace file.'));
    reader.onload = () => resolve(dataUrlToBase64(String(reader.result || '')));
    reader.readAsDataURL(file);
  });

  return { name, type, size, lastModified, base64 };
}

function decodeFile(value: EncodedFile): File {
  const binary = atob(value.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], value.name, { type: value.type || 'application/octet-stream', lastModified: value.lastModified || Date.now() });
}

function packetStorageKey(round: Round, caseId: string) {
  return caseId ? `${round}::${caseId}` : '';
}

export function workspaceSnapshotName(clientName: string, round: Round) {
  const safeClient = (clientName || 'CLIENT').replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const safeRound = round.replace(/\s+/g, '_').toUpperCase();
  return `${safeClient || 'CLIENT'}_${safeRound}_WORKSPACE_SNAPSHOT.json`;
}

export async function createWorkspaceSnapshot(input: {
  round: Round;
  caseId: string;
  source: string;
  originalSource: string;
  normalized: boolean;
  preferences: WorkspacePreferences;
}): Promise<WorkspaceSnapshot> {
  assertBrowser();

  const parsed = parseSource(input.source);
  const routes = detectRoutes(parsed);
  const references = await Promise.all(loadReferenceMeta().map(async (slot): Promise<SnapshotReference> => ({
    ...slot,
    filePayload: await encodeFile(await readReferenceFile(slot.id), slot.file || `${slot.id}.docx`)
  })));

  const exhibitsByRound = {} as Record<Round, SnapshotRoundExhibits>;
  for (const round of rounds) {
    const current = loadTemplateExhibits(round);
    const snapshotRound = emptyRoundExhibits();
    for (const kind of exhibitKinds) {
      const asset = current[kind];
      snapshotRound[kind] = asset ? { ...asset, filePayload: await encodeFile(await readTemplateExhibit(round, kind), asset.name) } : null;
    }
    exhibitsByRound[round] = snapshotRound;
  }

  const key = packetStorageKey(input.round, input.caseId);
  const packetAssets = key ? loadPacketAssets(key) : { supporting: [], legalPdf: null };
  const packetFiles: Record<string, EncodedFile> = {};

  if (key) {
    for (const asset of packetAssets.supporting) {
      const file = await loadPacketFile(key, asset.id);
      const encoded = await encodeFile(file, asset.name);
      if (encoded) packetFiles[asset.id] = encoded;
    }
    if (packetAssets.legalPdf) {
      const file = await loadPacketFile(key, packetAssets.legalPdf.id);
      const encoded = await encodeFile(file, packetAssets.legalPdf.name);
      if (encoded) packetFiles[packetAssets.legalPdf.id] = encoded;
    }
  }

  return {
    engine: WORKSPACE_ENGINE,
    version: WORKSPACE_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    fingerprint: {
      userAgent: navigator.userAgent,
      appOrigin: window.location.origin,
      sourceHash: hashText(input.source),
      routeCount: routes.length,
      disputeAccountCount: bureaus.reduce((total, bureau) => total + parsed.dispute[bureau].length, 0),
      hardInquiryCount: bureaus.reduce((total, bureau) => total + parsed.inquiry[bureau].length, 0),
      latePaymentCount: bureaus.reduce((total, bureau) => total + parsed.late[bureau].length, 0)
    },
    round: input.round,
    caseId: input.caseId,
    source: {
      text: input.source,
      originalSource: input.originalSource,
      normalized: input.normalized
    },
    preferences: input.preferences,
    references,
    exhibitsByRound,
    packetAssets,
    packetFiles
  };
}

function validateSnapshot(value: unknown): WorkspaceSnapshot {
  const snapshot = value as WorkspaceSnapshot;
  if (!snapshot || snapshot.engine !== WORKSPACE_ENGINE) throw new Error('This is not a LetterGenerator workspace snapshot.');
  if (snapshot.version !== WORKSPACE_SNAPSHOT_VERSION) throw new Error(`Unsupported workspace snapshot version: ${snapshot.version}.`);
  if (!rounds.includes(snapshot.round)) throw new Error('Workspace snapshot has an invalid round.');
  return snapshot;
}

export async function parseWorkspaceSnapshotFile(file: File): Promise<WorkspaceSnapshot> {
  const raw = await file.text();
  return validateSnapshot(JSON.parse(raw));
}

export async function importWorkspaceSnapshot(snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshotImportResult> {
  assertBrowser();
  const value = validateSnapshot(snapshot);
  const notices: string[] = [];

  for (const slot of value.references || []) {
    if (!slot.filePayload) continue;
    await saveReferenceFile(slot, decodeFile(slot.filePayload));
  }

  for (const round of rounds) {
    const exhibits = value.exhibitsByRound?.[round];
    if (!exhibits) continue;
    for (const kind of exhibitKinds) {
      const asset = exhibits[kind];
      if (!asset?.filePayload) continue;
      await saveTemplateExhibit(round, kind, decodeFile(asset.filePayload));
    }
  }

  const key = packetStorageKey(value.round, value.caseId);
  if (key) {
    const files: Record<string, File> = {};
    Object.entries(value.packetFiles || {}).forEach(([id, payload]) => { files[id] = decodeFile(payload); });
    await replacePacketAssetsFromSnapshot(key, value.packetAssets || { supporting: [], legalPdf: null }, files);
  } else if (value.packetAssets.supporting.length || value.packetAssets.legalPdf) {
    notices.push('Supporting document files were present, but no case ID was stored in the snapshot.');
  }

  const references = loadReferenceMeta();
  const templates = loadTemplateExhibits(value.round);
  const evidence = key ? loadPacketAssets(key) : { supporting: [], legalPdf: null };

  const missingReferencePayloads = (value.references || []).filter((slot) => slot.file && !slot.filePayload).length;
  if (missingReferencePayloads) notices.push(`${missingReferencePayloads} letter template metadata item(s) had no file payload.`);

  return {
    round: value.round,
    caseId: value.caseId,
    source: value.source.text,
    originalSource: value.source.originalSource,
    normalized: value.source.normalized,
    references,
    templates,
    evidence,
    notices
  };
}
