import { inspectTemplateContract, type TemplateContract } from './template-contracts';
import { isFeatureEnabled } from './feature-flags';

export type ExhibitKind = 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';
export type ActiveExhibitKind = ExhibitKind;
export type ExhibitMode = 'STATIC_PDF' | 'GENERATED_DOCX';
export type ExhibitAsset = { id: string; kind: ExhibitKind; mode: ExhibitMode; name: string; type: string; size: number; contract?: TemplateContract };
export type TemplateExhibits = Record<ExhibitKind, ExhibitAsset | null>;

const DB_NAME = 'lettergenerator-private-templates';
const STORE_NAME = 'files';
const META_PREFIX = 'lettergenerator.template-exhibits.v2.';
const LEGACY_PREFIX = 'lettergenerator.template-exhibits.v1.';

/**
 * Get the active exhibit kinds based on feature flags.
 * FTC is excluded from the active list when the feature is disabled.
 */
function getActiveExhibitKinds(): ActiveExhibitKind[] {
  return ['FCRA', 'AFFIDAVIT', 'ATTACHMENT', 'FTC'];
}

/** FTC is retained in stored metadata for backward compatibility only; it is not an active packet component unless enabled. */
export const exhibitKinds: ActiveExhibitKind[] = getActiveExhibitKinds();
export const exhibitModes: Record<ExhibitKind, ExhibitMode> = {
  FCRA: 'STATIC_PDF',
  AFFIDAVIT: 'GENERATED_DOCX',
  ATTACHMENT: 'STATIC_PDF',
  FTC: 'GENERATED_DOCX'
};
export const exhibitTitles: Record<ExhibitKind, string> = {
  FCRA: 'FCRA Legal Exhibit',
  AFFIDAVIT: 'Affidavit',
  ATTACHMENT: 'Attachment',
  FTC: 'FTC Identity Theft Report'
};
export const exhibitAccept: Record<ExhibitKind, string> = {
  FCRA: '.pdf,application/pdf',
  AFFIDAVIT: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ATTACHMENT: '.pdf,application/pdf',
  FTC: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function empty(): TemplateExhibits { return { FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null }; }
function fileKey(round: string, kind: ExhibitKind) { return `template-exhibit/${round}/${kind}`; }
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function normalizedAsset(kind: ExhibitKind, asset: ExhibitAsset | null | undefined): ExhibitAsset | null {
  if (!asset) return null;
  return { ...asset, kind, mode: exhibitModes[kind] };
}
function saveMeta(round: string, value: TemplateExhibits) { localStorage.setItem(`${META_PREFIX}${round}`, JSON.stringify(value)); }
export function loadTemplateExhibits(round: string): TemplateExhibits {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(`${META_PREFIX}${round}`) || localStorage.getItem(`${LEGACY_PREFIX}${round}`);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<TemplateExhibits>;
    return { FCRA: normalizedAsset('FCRA', data.FCRA), AFFIDAVIT: normalizedAsset('AFFIDAVIT', data.AFFIDAVIT), ATTACHMENT: normalizedAsset('ATTACHMENT', data.ATTACHMENT), FTC: normalizedAsset('FTC', data.FTC) };
  } catch { return empty(); }
}
function assertFileType(kind: ExhibitKind, file: File) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isDocx = /\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (exhibitModes[kind] === 'STATIC_PDF' && !isPdf) throw new Error(`${exhibitTitles[kind]} accepts PDF files only.`);
  if (exhibitModes[kind] === 'GENERATED_DOCX' && !isDocx) throw new Error(`${exhibitTitles[kind]} accepts DOCX template files only.`);
}
export async function saveTemplateExhibit(round: string, kind: ExhibitKind, file: File) {
  assertFileType(kind, file);
  const contract = await inspectTemplateContract(file, kind);
  const id = fileKey(round, kind);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  db.close();
  const next = loadTemplateExhibits(round);
  next[kind] = { id, kind, mode: exhibitModes[kind], name: file.name, type: file.type || 'application/octet-stream', size: file.size, contract };
  saveMeta(round, next);
  return next;
}
export async function removeTemplateExhibit(round: string, kind: ExhibitKind) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).delete(fileKey(round, kind)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
  const next = loadTemplateExhibits(round); next[kind] = null; saveMeta(round, next); return next;
}
export async function readTemplateExhibit(round: string, kind: ExhibitKind): Promise<File | null> {
  const db = await openDb();
  const value = await new Promise<File | null>((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(fileKey(round, kind)); request.onsuccess = () => resolve((request.result as File) || null); request.onerror = () => reject(request.error); });
  db.close();
  return value;
}
export function configuredExhibits(value: TemplateExhibits) { return exhibitKinds.filter((kind) => Boolean(value[kind])); }
export function generatedExhibits(value: TemplateExhibits) { return exhibitKinds.filter((kind) => exhibitModes[kind] === 'GENERATED_DOCX' && Boolean(value[kind])); }
export function staticPdfExhibits(value: TemplateExhibits) { return exhibitKinds.filter((kind) => exhibitModes[kind] === 'STATIC_PDF' && Boolean(value[kind])); }
