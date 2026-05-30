export type ExhibitKind = 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';
export type ExhibitAsset = { id: string; kind: ExhibitKind; name: string; type: string; size: number };
export type TemplateExhibits = Record<ExhibitKind, ExhibitAsset | null>;

const DB_NAME = 'lettergenerator-private-templates';
const STORE_NAME = 'files';
const META_PREFIX = 'lettergenerator.template-exhibits.v1.';
const kinds: ExhibitKind[] = ['FCRA', 'AFFIDAVIT', 'ATTACHMENT', 'FTC'];
const empty = (): TemplateExhibits => ({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
const fileKey = (round: string, kind: ExhibitKind) => `template-exhibit/${round}/${kind}`;

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
function saveMeta(round: string, value: TemplateExhibits) {
  localStorage.setItem(`${META_PREFIX}${round}`, JSON.stringify(value));
}
export function loadTemplateExhibits(round: string): TemplateExhibits {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(`${META_PREFIX}${round}`);
    const data = raw ? JSON.parse(raw) as Partial<TemplateExhibits> : {};
    return { FCRA: data.FCRA || null, AFFIDAVIT: data.AFFIDAVIT || null, ATTACHMENT: data.ATTACHMENT || null, FTC: data.FTC || null };
  } catch { return empty(); }
}
export async function saveTemplateExhibit(round: string, kind: ExhibitKind, file: File) {
  if (kind === 'FCRA' && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('FCRA accepts PDF files only.');
  const id = fileKey(round, kind);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const next = loadTemplateExhibits(round);
  next[kind] = { id, kind, name: file.name, type: file.type || 'application/octet-stream', size: file.size };
  saveMeta(round, next);
  return next;
}
export async function removeTemplateExhibit(round: string, kind: ExhibitKind) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(fileKey(round, kind));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const next = loadTemplateExhibits(round);
  next[kind] = null;
  saveMeta(round, next);
  return next;
}
export async function readTemplateExhibit(round: string, kind: ExhibitKind): Promise<File | null> {
  const db = await openDb();
  const value = await new Promise<File | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(fileKey(round, kind));
    request.onsuccess = () => resolve((request.result as File) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}
export function configuredExhibits(value: TemplateExhibits) {
  return kinds.filter((kind) => Boolean(value[kind]));
}
